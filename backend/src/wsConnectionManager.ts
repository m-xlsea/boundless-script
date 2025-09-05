import { WsClient } from "./wsclient";

// WebSocket连接统计信息接口
export interface WSConnectionStats {
  userId: string;
  username: string;
  connectTime: number;
  requestCount: number;
  lastRequestTime: number;
  connectionDuration: number; // 连接时长（秒）
}

export class WSConnectionManager {
  private static connections = new Map<string, WsClient>();
  private static connectionStats = new Map<string, WSConnectionStats>();

  /**
   * 添加WebSocket连接
   */
  static addConnection(userId: string, wsClient: WsClient): void {
    this.connections.set(userId, wsClient);
  }

  /**
   * 初始化连接统计
   */
  static initConnectionStats(userId: string, username: string): void {
    const now = Date.now();
    this.connectionStats.set(userId, {
      userId,
      username,
      connectTime: now,
      requestCount: 0,
      lastRequestTime: now,
      connectionDuration: 0,
    });
  }

  /**
   * 增加请求计数
   */
  static incrementRequestCount(userId: string): void {
    const stats = this.connectionStats.get(userId);
    if (stats) {
      stats.requestCount++;
      stats.lastRequestTime = Date.now();
      this.connectionStats.set(userId, stats);
    }
  }

  /**
   * 获取WebSocket连接
   */
  static getConnection(userId: string): WsClient | undefined {
    return this.connections.get(userId);
  }

  /**
   * 移除WebSocket连接
   */
  static removeConnection(userId: string): boolean {
    this.connectionStats.delete(userId);
    return this.connections.delete(userId);
  }

  /**
   * 获取所有连接的用户ID
   */
  static getAllConnectionIds(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * 获取所有WebSocket连接
   */
  static getAllConnections(): Map<string, WsClient> {
    return new Map(this.connections);
  }

  /**
   * 根据状态查找连接
   */
  static findConnectionByStatus(status: string): WsClient | undefined {
    for (const [_, wsClient] of this.connections) {
      if (wsClient.status === status) {
        return wsClient;
      }
    }
    return undefined;
  }

  /**
   * 获取在线连接数量
   */
  static getOnlineConnectionsCount(): number {
    let count = 0;
    for (const [_, wsClient] of this.connections) {
      if (wsClient.status === "online") {
        count++;
      }
    }
    return count;
  }

  /**
   * 广播消息给所有连接
   */
  static broadcast(message: string): void {
    for (const [_, wsClient] of this.connections) {
      wsClient.send(message);
    }
  }

  /**
   * 广播消息给在线用户
   */
  static broadcastToOnline(message: string): void {
    for (const [_, wsClient] of this.connections) {
      if (wsClient.status === "online") {
        wsClient.send(message);
      }
    }
  }

  /**
   * 清理所有连接
   */
  static clearAllConnections(): void {
    for (const [_, wsClient] of this.connections) {
      wsClient.close();
    }
    this.connections.clear();
    this.connectionStats.clear();
  }

  /**
   * 获取所有连接统计信息
   */
  static getAllConnectionStats(): WSConnectionStats[] {
    const now = Date.now();
    const stats: WSConnectionStats[] = [];

    for (const [userId, connectionStat] of this.connectionStats) {
      const duration = Math.floor((now - connectionStat.connectTime) / 1000);
      stats.push({
        ...connectionStat,
        connectionDuration: duration,
      });
    }

    return stats;
  }

  /**
   * 获取特定用户的连接统计
   */
  static getConnectionStats(userId: string): WSConnectionStats | undefined {
    const stats = this.connectionStats.get(userId);
    if (!stats) return undefined;

    const now = Date.now();
    const duration = Math.floor((now - stats.connectTime) / 1000);

    return {
      ...stats,
      connectionDuration: duration,
    };
  }
}
