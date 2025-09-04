import { Elysia } from "elysia";
import { WsClient } from "./wsclient";
import { get, post } from "./httptool";
import { BOSSinfo, UserInfo, getTime } from "./globalData";
import cors from "@elysiajs/cors";
import cron from "@elysiajs/cron";

let NPCtoken = "";
// WebSocket 和用户名的映射
const wsUserMap = new Map<any, string>();

const getNPCtoken = async () => {
  try {
    const res = (await post("https://boundless.wenzi.games/api/auth/login", { username: "andiliba2", password: "zsm85887823" })) as any;
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
getNPCtoken();
// 简单的 Elysia HTTP + WS 服务器
const app = new Elysia()
  .use(cors())
  .get("/", () => "Hello Elysia")
  .post("/stopbattle", async ({ body }: { body: { username: string; password: string } }) => {
    const user = UserInfo.get(body.username);
    if (user && user.password !== body.password) {
      return {
        message: "用户名或密码错误",
      };
    }
    if (user) {
      user.stopBattleFnc();
    }
    return {
      message: "停止战斗",
    };
  })
  .post("/login", async ({ body }: { body: { username: string; password: string } }) => {
    const username = body.username;
    if (UserInfo.has(username) && UserInfo.get(username)?.password === body.password) {
      const user = UserInfo.get(username);
      if (user?.status === "online") {
        return {
          message: "用户已登录",
        };
      } else if (user?.status === "offline") {
        const res = (await post("https://boundless.wenzi.games/api/auth/login", body)) as any;
        if (res.error) {
          return {
            message: res.error,
          };
        }
        user.token = res.token;
        user.wsAuth = `40{"token":"${res.token}"}`;
        user.username = body.username;
        user.password = body.password;
        user.status = "online";
        user.connect();

        return {
          message: "用户已登录",
        };
      }
    }

    const res = (await post("https://boundless.wenzi.games/api/auth/login", body)) as any;

    if (res.error) {
      return {
        message: res.error,
      };
    }
    const user = new WsClient(res.token, body.username, body.password, "online");
    UserInfo.set(body.username, user);
    user.connect();

    return {
      message: "登录成功",
      token: res.token,
    };
  })
  .ws("/ws", {
    open: (ws) => {
      console.log("ws open", "server");
    },
    message: (ws, message: any) => {
      const event = message.event;
      const data = message.data;
      if (event === "connect") {
        const user = UserInfo.get(data.username);
        if (user && user.password !== data.password) {
          ws.close();
          return;
        }
        // 保存 WebSocket 和用户名的映射
        wsUserMap.set(ws.id, data.username);
        console.log("用户连接:", data.username);
      } else if (event === "battlelog") {
        const username = wsUserMap.get(ws.id);
        if (username) {
          //console.log("请求战斗日志:", username);
          const user = UserInfo.get(username);

          if (user) {
            ws.send(JSON.stringify({ event: "battlelog", data: user.formatBattleSteps() }));
          }
        }
      } else if (event === "log") {
        const username = wsUserMap.get(ws.id);
        if (username) {
          const user = UserInfo.get(username);
          if (user) {
            ws.send(JSON.stringify({ event: "log", data: user.formatLogs() }));
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
      pattern: "*/5 * * * * *",
      async run() {
        try {
          const res: any = await get("https://boundless.wenzi.games/api/worldboss/current", { Authorization: "Bearer " + NPCtoken });
          if (res.boss != null && res.boss._id != BOSSinfo.worldBossId) {
            BOSSinfo.worldBossId = res.boss._id;
            console.log("更换boss", BOSSinfo.worldBossId);
            const challengeRes: any = await post(`https://boundless.wenzi.games/api/worldboss/${BOSSinfo.worldBossId}/challenge`, {}, { Authorization: "Bearer " + NPCtoken });
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
          const onlineUsers = Array.from(UserInfo.values()).filter((ws) => ws.status === "online");

          onlineUsers.forEach((ws) => {
            ws.joinBattle();
          });

          if (onlineUsers.length > 0) {
            console.log(`${onlineUsers.length} 个在线用户加入了战斗`);
          } else {
            console.log("没有找到在线的用户");
          }
        } catch (error) {
          console.log("error");
          console.log(error);
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
          const offlineUsers = Array.from(UserInfo.values()).filter((ws) => ws.status === "offline" && !ws.stopBattle);

          offlineUsers.forEach(async (ws) => {
            try {
              const res = (await post("https://boundless.wenzi.games/api/auth/login", { username: ws.username, password: ws.password })) as any;
              if (res.error) {
                console.log(`用户 ${ws.username} 重新登录失败:`, res.error);
                return;
              }

              ws.token = res.token;
              ws.wsAuth = `40{"token":"${res.token}"}`;
              ws.username = ws.username;
              ws.password = ws.password;
              ws.logs.push(getTime() + " " + ws.username + "重新连接ws");
              ws.status = "online";
              ws.connect();
              await new Promise((resolve) => setTimeout(resolve, 2000));
            } catch (error) {
              console.log(`用户 ${ws.username} 重新连接异常:`, error);
            }
          });

          if (offlineUsers.length > 0) {
            console.log(`重新连接了 ${offlineUsers.length} 个离线用户`);
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
          const onlineUsers = Array.from(UserInfo.values()).filter((ws) => ws.status === "online");
          onlineUsers.forEach((ws) => {
            ws.send(`42["battleHeartbeat",{"challengeId":"${BOSSinfo.challengeId}","battleType":"worldboss","clientTimestamp":${new Date().getTime()},"connectionQuality":"good"}]`);
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
          const onlineUsers = Array.from(UserInfo.values()).filter((ws) => ws.status === "online");
          onlineUsers.forEach((ws) => {
            ws.joinBattle();
          });
        } catch (error) {
          console.log("重发战斗任务异常:", error);
        }
      },
    })
  )

  .listen(3333);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
