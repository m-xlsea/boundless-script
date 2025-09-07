import { leaderboard, parseSocketIoEvent, getTime } from "./globalData";
import { BOSSinfo } from "./globalData";
import { UserDataService } from "./userDataService";
import { WSConnectionManager } from "./wsConnectionManager";

export class WsClient {
  private readonly url: string;
  ws: WebSocket | null = null;
  userId: string;
  status: string;
  tempBattleSteps: any[] = [];
  tempLogs: any[] = [];

  constructor(userId: string, token: string) {
    this.url = "wss://boundless.wenzi.games/socket.io/?EIO=4&transport=websocket";
    this.userId = userId;
    this.status = "offline";
  }

  connect() {
    this.createConnection();
  }

  send(data: string | ArrayBuffer | Uint8Array) {
    this.ws?.send(data);
  }

  sendJson(payload: unknown) {
    this.send(JSON.stringify(payload));
  }

  close(code?: number, reason?: string) {
    this.ws?.close(code, reason);
    this.ws = null;
  }

  private async createConnection() {
    try {
      const userData = await UserDataService.getUserData(this.userId);
      if (!userData) {
        console.error("用户数据不存在");
        return;
      }

      const ws = new WebSocket(this.url);
      this.ws = ws;

      ws.onopen = async () => {
        await UserDataService.setStopBattle(this.userId, false);

        this.send(`40{"token":"${userData.token}"}`);
        this.status = "online";
        await UserDataService.updateUserStatus(this.userId, "online");
        await UserDataService.addLog(this.userId, getTime() + " " + userData.username + "上线了");
        this.tempBattleSteps = (userData.battleSteps || []).slice(-20);
        this.tempLogs = (userData.logs || []).slice(-20);
        setTimeout(() => {
          this.joinBattle();
        }, 1000);
      };

      ws.onmessage = async (ev) => {
        if (ev.data == "2") {
          this.send("3");
        }
        const event = parseSocketIoEvent(ev.data);
        if (event) {
          switch (event.event) {
            case "worldBossHpUpdate":
              // 根据新的数据结构进行赋值
              BOSSinfo.bossCurrentHp = event.data.currentHp;
              BOSSinfo.bossTotalHp = event.data.maxHp;

              // 其余字段如有需要可继续补充
              break;
            case "worldBossBattleStep":
              event.data.time = getTime();
              await UserDataService.addBattleStep(this.userId, event.data);
              this.addBattleStep(event.data);
              break;
            case "worldBossLeaderboardUpdate":
              leaderboard.leaderboard = event.data;
              break;
            default:
              //console.log("message", event);

              break;
          }
        }
      };

      ws.onclose = async (ev) => {
        const userData = await UserDataService.getUserData(this.userId);
        if (userData) {
          console.log(getTime(), userData.username, "掉线了", ev);
          await UserDataService.addLog(this.userId, getTime() + " " + userData.username + "掉线了");
        }
        this.status = "offline";
        await UserDataService.updateUserStatus(this.userId, "offline");
        WSConnectionManager.removeConnection(this.userId);
      };

      ws.onerror = (err) => {
        console.log("error", err);
      };
    } catch (err) {}
  }
  async joinBattle() {
    this.send(
      `42["startWorldBossBattle",{"worldBossId":"${BOSSinfo.worldBossId}","challengeId":"${BOSSinfo.challengeId}"}]`
    );
    const userData = await UserDataService.getUserData(this.userId);
    if (userData) {
      console.log(getTime(), userData.username, "准备进入世界boss战斗:", BOSSinfo.bossName);
      await UserDataService.addLog(
        this.userId,
        getTime() + " " + userData.username + "准备进入世界boss战斗:" + BOSSinfo.bossName
      );
      this.addLog(
        getTime() + " " + userData.username + "准备进入世界boss战斗:" + BOSSinfo.bossName
      );
    }
  }
  async formatBattleSteps() {
    const userData = await UserDataService.getUserData(this.userId);
    if (!userData) return [];

    const battleSteps = this.tempBattleSteps.map((step: any) => {
      const temp = {
        time: step.time,
        username: this.userId,
        conditionalEffects: step.conditionalEffects
          ? step.conditionalEffects.map((effect: any) => effect.name)
          : [],
        damage: step.damage,
        cHP: step.currentEnemyHP,
        mHP: step.enemyHPMax,
        isCrit: step.isCrit,
        isMiss: step.isMiss,
      };
      const log = [
        temp.time,
        temp.username,
        temp.conditionalEffects,
        temp.damage,
        temp.cHP,
        temp.mHP,
        temp.isCrit,
        temp.isMiss,
      ];

      return log;
    });
    return battleSteps;
  }
  async formatLogs() {
    return this.tempLogs;
  }
  async stopBattleFnc() {
    await UserDataService.setStopBattle(this.userId, true);
    this.ws?.close();
    return {
      message: "停止战斗",
    };
  }
  addLog(log: string) {
    this.tempLogs.push(log);
    if (this.tempLogs.length > 20) {
      this.tempLogs = this.tempLogs.slice(-20);
    }
  }
  addBattleStep(battleStep: any) {
    this.tempBattleSteps.push(battleStep);
    if (this.tempBattleSteps.length > 20) {
      this.tempBattleSteps = this.tempBattleSteps.slice(-20);
    }
  }
}
