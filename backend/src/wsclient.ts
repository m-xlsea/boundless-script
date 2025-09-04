import { leaderboard, parseSocketIoEvent, getTime } from "./globalData";
import { BOSSinfo } from "./globalData";
export class WsClient {
  private readonly url: string;
  ws: WebSocket | null = null;
  token: string;
  wsAuth: string;
  username: string;
  password: string;
  status: string;
  battleSteps: object[];
  logs: string[];
  stopBattle: boolean;

  constructor(token: string, username: string, password: string, status: string) {
    this.url = "wss://boundless.wenzi.games/socket.io/?EIO=4&transport=websocket";
    // 默认空回调，便于可选传入
    this.token = token;
    this.wsAuth = `40{"token":"${token}"}`;
    this.username = username;
    this.password = password;
    this.status = status;
    this.battleSteps = [];
    this.logs = [];
    this.stopBattle = false;
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

  private createConnection() {
    try {
      const ws = new WebSocket(this.url);
      this.ws = ws;

      ws.onopen = () => {
        this.stopBattle = false;
        this.send(this.wsAuth);
        //console.log("open");
        this.logs.push(getTime() + " " + this.username + "上线了");
        setTimeout(() => {
          this.joinBattle();
        }, 1000);
      };

      ws.onmessage = (ev) => {
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
              BOSSinfo.worldBossId = event.data.bossId;
              // 其余字段如有需要可继续补充
              break;
            case "worldBossBattleStep":
              event.data.time = getTime();
              this.battleSteps.push(event.data);
              // 仅保留最新 20 条
              if (this.battleSteps.length > 20) {
                this.battleSteps.splice(0, this.battleSteps.length - 20);
              }

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

      ws.onclose = (ev) => {
        console.log(getTime(), this.username, "掉线了", ev);
        this.logs.push(getTime() + " " + this.username + "掉线了");
        this.status = "offline";
      };

      ws.onerror = (err) => {
        console.log("error", err);
      };
    } catch (err) {}
  }
  joinBattle() {
    this.send(`42["startWorldBossBattle",{"worldBossId":"${BOSSinfo.worldBossId}","challengeId":"${BOSSinfo.challengeId}"}]`);
    console.log(getTime(), this.username, "准备进入世界boss战斗:", BOSSinfo.bossName);
    this.logs.push(getTime() + " " + this.username + "准备进入世界boss战斗:" + BOSSinfo.bossName);
  }
  formatBattleSteps() {
    const battleSteps = this.battleSteps.map((step: any) => {
      const temp = {
        time: step.time,
        username: this.username,
        conditionalEffects: step.conditionalEffects ? step.conditionalEffects.map((effect: any) => effect.name) : [],
        damage: step.damage,
        cHP: step.currentEnemyHP,
        mHP: step.enemyHPMax,
        isCrit: step.isCrit,
        isMiss: step.isMiss,
      };
      const log = [temp.time, temp.username, temp.conditionalEffects, temp.damage, temp.cHP, temp.mHP, temp.isCrit, temp.isMiss];

      return log;
    });
    return battleSteps;
  }
  formatLogs() {
    if (this.logs.length > 20) {
      this.logs.splice(0, this.logs.length - 20);
    }
    return this.logs;
  }
  stopBattleFnc() {
    this.stopBattle = true;
    this.ws?.close();
    return {
      message: "停止战斗",
    };
  }
}
