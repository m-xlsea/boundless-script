import redis from "./redis";

export interface UserData {
  token: string;
  username: string;
  password: string;
  status: string;
  battleSteps: object[];
  logs: string[];
  stopBattle: boolean;
}

export class UserDataService {
  private static readonly USER_KEY_PREFIX = "user:";
  private static readonly USER_LIST_KEY = "users:list";

  /**
   * 保存用户数据到Redis
   */
  static async saveUserData(userId: string, userData: UserData): Promise<void> {
    const key = this.USER_KEY_PREFIX + userId;
    await redis.hset(key, {
      token: userData.token,
      username: userData.username,
      password: userData.password,
      status: userData.status,
      battleSteps: JSON.stringify(userData.battleSteps),
      logs: JSON.stringify(userData.logs),
      stopBattle: userData.stopBattle.toString(),
    });

    // 将用户ID添加到用户列表
    await redis.sadd(this.USER_LIST_KEY, userId);
  }

  /**
   * 从Redis获取用户数据
   */
  static async getUserData(userId: string): Promise<UserData | null> {
    const key = this.USER_KEY_PREFIX + userId;
    const data = await redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return {
      token: data.token,
      username: data.username,
      password: data.password,
      status: data.status,
      battleSteps: JSON.parse(data.battleSteps || "[]"),
      logs: JSON.parse(data.logs || "[]"),
      stopBattle: data.stopBattle === "true",
    };
  }

  /**
   * 更新用户状态
   */
  static async updateUserStatus(userId: string, status: string): Promise<void> {
    const key = this.USER_KEY_PREFIX + userId;
    await redis.hset(key, "status", status);
  }

  /**
   * 添加战斗步骤
   */
  static async addBattleStep(userId: string, battleStep: object): Promise<void> {
    const userData = await this.getUserData(userId);
    if (!userData) return;

    userData.battleSteps.push(battleStep);
    // 仅保留最新20条
    if (userData.battleSteps.length > 20) {
      userData.battleSteps.splice(0, userData.battleSteps.length - 20);
    }

    const key = this.USER_KEY_PREFIX + userId;
    await redis.hset(key, "battleSteps", JSON.stringify(userData.battleSteps));
  }

  /**
   * 添加日志
   */
  static async addLog(userId: string, log: string): Promise<void> {
    const userData = await this.getUserData(userId);
    if (!userData) return;

    userData.logs.push(log);
    // 仅保留最新20条
    if (userData.logs.length > 20) {
      userData.logs.splice(0, userData.logs.length - 20);
    }

    const key = this.USER_KEY_PREFIX + userId;
    await redis.hset(key, "logs", JSON.stringify(userData.logs));
  }

  /**
   * 设置停止战斗状态
   */
  static async setStopBattle(userId: string, stopBattle: boolean): Promise<void> {
    const key = this.USER_KEY_PREFIX + userId;
    await redis.hset(key, "stopBattle", stopBattle.toString());
  }

  /**
   * 获取所有在线用户
   */
  static async getOnlineUsers(): Promise<string[]> {
    const userIds = await redis.smembers(this.USER_LIST_KEY);
    const onlineUsers: string[] = [];

    for (const userId of userIds) {
      const userData = await this.getUserData(userId);
      if (userData && userData.status === "online") {
        onlineUsers.push(userId);
      }
    }

    return onlineUsers;
  }

  /**
   * 删除用户数据
   */
  static async deleteUserData(userId: string): Promise<void> {
    const key = this.USER_KEY_PREFIX + userId;
    await redis.del(key);
    await redis.srem(this.USER_LIST_KEY, userId);
  }

  /**
   * 获取所有用户ID
   */
  static async getAllUserIds(): Promise<string[]> {
    return await redis.smembers(this.USER_LIST_KEY);
  }
}
