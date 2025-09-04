import { WsClient } from "./wsclient";

export const UserInfo = new Map<string, WsClient>();
export const BOSSinfo = {
  worldBossId: "",
  challengeId: "",
  bossTotalHp: 0,
  bossCurrentHp: 0,
  bossName: "",
};
export const leaderboard = {
  leaderboard: [],
};
export function parseSocketIoEvent(msg: string): { event: string; data: any } | null {
  // 只处理形如 42["event", {...}] 的文本帧
  const i = msg.indexOf("[");
  if (i === -1) return null;
  const jsonText = msg.slice(i);
  try {
    const arr = JSON.parse(jsonText);
    if (!Array.isArray(arr) || typeof arr[0] !== "string") return null;
    return { event: arr[0], data: arr[1] };
  } catch {
    return null;
  }
}
const findBossAndJoin = (bossId: string) => {
  const findUsefulWs = Array.from(UserInfo.values()).find((ws) => ws.status === "online");
  if (findUsefulWs) {
    findUsefulWs.send(`42["startWorldBossBattle",{"worldBossId":"${bossId}","challengeId":"${BOSSinfo.challengeId}"}]`);
  }
};
//生成时间 hh:mm:ss
export const getTime = () => {
  return new Date().toLocaleTimeString();
};
