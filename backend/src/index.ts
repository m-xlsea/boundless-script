import { Elysia } from "elysia";
import { WsClient } from "./wsclient";
import { get, post } from "./httptool";
import { BOSSinfo, getTime } from "./globalData";
import { UserDataService } from "./userDataService";
import { WSConnectionManager } from "./wsConnectionManager";
import { StartupService } from "./startupService";
import cors from "@elysiajs/cors";
import cron from "@elysiajs/cron";

let NPCtoken = "";
// WebSocket 和用户名的映射
const wsUserMap = new Map<any, string>();

const getNPCtoken = async () => {
  try {
    const res = (await post("https://boundless.wenzi.games/api/auth/login", {
      username: process.env.NPC_USERNAME,
      password: process.env.NPC_PASSWORD,
    })) as any;
    if (res.error) {
      console.log("获取NPC token失败:", res.error);
      return {
        message: res.error,
      };
    }
    NPCtoken = res.token;
    console.log("获取NPC token成功");
  } catch (error) {
    console.log("获取NPC token异常:", error);
  }
};

// 启动时初始化
const initializeServer = async () => {
  console.log("🚀 服务器启动中...");

  // 1. 获取NPC token
  await getNPCtoken();

  // 2. 恢复Redis中的用户数据
  await StartupService.recoverUsersFromRedis();

  // 3. 清理无效数据（可选）
  await StartupService.cleanupInvalidData();

  // 4. 显示恢复统计
  const stats = await StartupService.getRecoveryStats();
  console.log("📊 恢复统计:");
  console.log(`   - 总用户数: ${stats.totalUsers}`);
  console.log(`   - 在线用户: ${stats.onlineUsers}`);
  console.log(`   - 离线用户: ${stats.offlineUsers}`);
  console.log(`   - 活跃连接: ${stats.activeConnections}`);

  console.log("✅ 服务器初始化完成");
};
// 简单的 Elysia HTTP + WS 服务器
const app = new Elysia({
  websocket: {
    perMessageDeflate: {
      compress: true,
      decompress: true,
    },
  },
})
  .use(cors())
  .get("/", () => "Hello Elysia")
  .get("/status", async () => {
    const stats = await StartupService.getRecoveryStats();
    const connectionStats = WSConnectionManager.getAllConnectionStats();

    return {
      message: "服务器运行正常",
      stats: {
        totalUsers: stats.totalUsers,
        onlineUsers: stats.onlineUsers,
        offlineUsers: stats.offlineUsers,
        activeConnections: stats.activeConnections,
      },
      connectionStats: connectionStats.map(
        (stat) =>
          `${stat.userId}时长${stat.connectionDuration}秒,请求数${stat.requestCount}，每秒请求数${
            stat.connectionDuration > 0
              ? (stat.requestCount / stat.connectionDuration).toFixed(2)
              : "0.00"
          }`
      ),
      timestamp: new Date().toISOString(),
    };
  })
  .post("/stopbattle", async ({ body }: { body: { username: string; password: string } }) => {
    const userData = await UserDataService.getUserData(body.username);
    if (!userData) {
      return {
        message: "用户不存在",
      };
    }

    if (userData.password !== body.password) {
      return {
        message: "用户名或密码错误",
      };
    }

    const wsConnection = WSConnectionManager.getConnection(body.username);
    if (wsConnection) {
      await wsConnection.stopBattleFnc();
    }

    return {
      message: "停止战斗",
    };
  })
  .post("/login", async ({ body }: { body: { username: string; password: string } }) => {
    if (!body.username || !body.password) {
      return {
        message: "用户名或密码不能为空",
      };
    }
    const username = body.username;
    const existingUserData = await UserDataService.getUserData(username);
    const existingConnection = WSConnectionManager.getConnection(username);

    // 如果用户数据存在且密码匹配
    if (existingUserData && existingUserData.password === body.password) {
      if (existingUserData.status === "online" && existingConnection) {
        return {
          message: "用户已登录",
        };
      } else {
        // 用户离线，重新登录
        const res = (await post("https://boundless.wenzi.games/api/auth/login", body)) as any;
        if (res.error) {
          return {
            message: res.error,
          };
        }

        // 更新用户数据中的token
        existingUserData.token = res.token;
        existingUserData.status = "online";
        await UserDataService.saveUserData(username, existingUserData);

        // 创建新的WebSocket连接
        const wsClient = new WsClient(username, res.token);
        WSConnectionManager.addConnection(username, wsClient);
        wsClient.connect();

        return {
          message: "用户已登录",
        };
      }
    }

    // 新用户登录
    const res = (await post("https://boundless.wenzi.games/api/auth/login", body)) as any;

    if (res.error) {
      return {
        message: res.error,
      };
    }

    // 保存用户数据到Redis
    const userData = {
      token: res.token,
      username: body.username,
      password: body.password,
      status: "online",
      battleSteps: [],
      logs: [],
      stopBattle: false,
    };
    await UserDataService.saveUserData(username, userData);

    // 创建WebSocket连接
    const wsClient = new WsClient(username, res.token);
    WSConnectionManager.addConnection(username, wsClient);
    wsClient.connect();

    return {
      message: "登录成功",
      token: res.token,
    };
  })
  .ws("/ws", {
    open: (ws) => {
      console.log("ws open", "server");
    },
    message: async (ws, message: any) => {
      const event = message.event;
      const data = message.data;

      // 对所有消息进行计数
      const username = wsUserMap.get(ws.id);
      if (username) {
        WSConnectionManager.incrementRequestCount(username);
      }

      if (event === "connect") {
        const userData = await UserDataService.getUserData(data.username);
        if (!userData || userData.password !== data.password) {
          ws.close();
          return;
        }
        // 保存 WebSocket 和用户名的映射
        wsUserMap.set(ws.id, data.username);
        // 初始化连接统计
        WSConnectionManager.initConnectionStats(data.username, userData.username);
        console.log("用户连接:", data.username);
      } else if (event === "battlelog") {
        const username = wsUserMap.get(ws.id);
        if (username) {
          //console.log("请求战斗日志:", username);
          const wsConnection = WSConnectionManager.getConnection(username);

          if (wsConnection) {
            const battleSteps = await wsConnection.formatBattleSteps();
            ws.send(JSON.stringify({ event: "battlelog", data: battleSteps }));
            wsConnection.tempBattleSteps = [];
          }
        }
      } else if (event === "log") {
        const username = wsUserMap.get(ws.id);
        if (username) {
          const wsConnection = WSConnectionManager.getConnection(username);
          if (wsConnection) {
            const logs = await wsConnection.formatLogs();
            wsConnection.tempLogs = [];
            ws.send(JSON.stringify({ event: "log", data: logs }));
          }
        }
      }
    },
    close: (ws) => {
      const username = wsUserMap.get(ws);
      if (username) {
        console.log("用户断开连接:", username);
        wsUserMap.delete(ws); // 清理映射关系
      } else {
        console.log("ws close", "server");
      }
    },
  })

  .use(
    cron({
      name: "refreshBossId",
      pattern: "*/1 * * * * *",
      async run() {
        try {
          const res: any = await get("https://boundless.wenzi.games/api/worldboss/current", {
            Authorization: "Bearer " + NPCtoken,
          });

          if (res.boss != null && res.boss._id != BOSSinfo.worldBossId) {
            BOSSinfo.worldBossId = res.boss._id;
            console.log("更换boss", BOSSinfo.worldBossId);
            const challengeRes: any = await post(
              `https://boundless.wenzi.games/api/worldboss/${BOSSinfo.worldBossId}/challenge`,
              {},
              { Authorization: "Bearer " + NPCtoken }
            );
            if (challengeRes.success) {
              BOSSinfo.challengeId = challengeRes.challengeId;
              BOSSinfo.bossName = res.boss.name;
              console.log("获取challengeId成功", BOSSinfo.bossName, BOSSinfo.challengeId);
            } else {
              return;
            }
          } else {
            return;
          }
          const onlineUserIds = await UserDataService.getOnlineUsers();
          let onlineConnections = 0;

          for (const userId of onlineUserIds) {
            const wsConnection = WSConnectionManager.getConnection(userId);
            if (wsConnection) {
              await wsConnection.joinBattle();
              onlineConnections++;
            }
          }

          if (onlineConnections > 0) {
            console.log(`${onlineConnections} 个在线用户加入了战斗`);
          } else {
            console.log("没有找到在线的用户");
          }
        } catch (error) {
          console.log("error");
          console.log(error);
          setTimeout(() => {
            getNPCtoken();
          }, 10000);
        }
      },
    })
  )
  .use(
    cron({
      name: "reconnectWs",
      pattern: "0 * * * * *",
      async run() {
        try {
          console.log("检查是否需要重新连接ws");
          const allUserIds = await UserDataService.getAllUserIds();
          let reconnectedCount = 0;

          for (const userId of allUserIds) {
            const userData = await UserDataService.getUserData(userId);
            if (!userData || userData.status !== "offline" || userData.stopBattle) {
              continue;
            }

            const existingConnection = WSConnectionManager.getConnection(userId);
            if (existingConnection) {
              continue; // 已经有连接了
            }

            try {
              const res = (await post("https://boundless.wenzi.games/api/auth/login", {
                username: userData.username,
                password: userData.password,
              })) as any;

              if (res.error) {
                console.log(`用户 ${userData.username} 重新登录失败:`, res.error);
                continue;
              }

              // 更新用户数据
              userData.token = res.token;
              userData.status = "online";
              await UserDataService.saveUserData(userId, userData);
              await UserDataService.addLog(
                userId,
                getTime() + " " + userData.username + "重新连接ws"
              );

              // 创建新的WebSocket连接
              const wsClient = new WsClient(userId, res.token);
              WSConnectionManager.addConnection(userId, wsClient);
              wsClient.connect();

              reconnectedCount++;
              await new Promise((resolve) => setTimeout(resolve, 2000));
            } catch (error) {
              console.log(`用户 ${userData.username} 重新连接异常:`, error);
            }
          }

          if (reconnectedCount > 0) {
            console.log(`重新连接了 ${reconnectedCount} 个离线用户`);
          }
        } catch (error) {
          console.log("重连任务异常:", error);
        }
      },
    })
  )
  .use(
    cron({
      name: "battleHeartbeat",
      pattern: "*/15 * * * * *",
      async run() {
        try {
          /*
           42["battleHeartbeat",{"challengeId":"worldboss_68b84c0ddc0ddf9e075bc27f_68b54dd0e97bf8d707b0e528_1756908669089","battleType":"worldboss","clientTimestamp":1756908671789,"connectionQuality":"good"}]
           */
          const onlineUserIds = await UserDataService.getOnlineUsers();
          onlineUserIds.forEach((userId) => {
            const wsConnection = WSConnectionManager.getConnection(userId);
            if (wsConnection) {
              wsConnection.send(
                `42["battleHeartbeat",{"challengeId":"${
                  BOSSinfo.challengeId
                }","battleType":"worldboss","clientTimestamp":${new Date().getTime()},"connectionQuality":"good"}]`
              );
            }
          });
        } catch (error) {
          console.log("心跳任务异常:", error);
        }
      },
    })
  )
  .use(
    cron({
      name: "resendBattleStart",
      pattern: "*/30 * * * * *",
      async run() {
        try {
          const onlineUserIds = await UserDataService.getOnlineUsers();
          onlineUserIds.forEach(async (userId) => {
            const wsConnection = WSConnectionManager.getConnection(userId);
            if (wsConnection) {
              await wsConnection.joinBattle();
            }
          });
        } catch (error) {
          console.log("重发战斗任务异常:", error);
        }
      },
    })
  )

  .listen(3333);

// 启动服务器并初始化
(async () => {
  try {
    await initializeServer();
    console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
  } catch (error) {
    console.error("❌ 服务器启动失败:", error);
    process.exit(1);
  }
})();
