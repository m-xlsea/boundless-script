import { WsClient } from "./wsclient";

export class WSConnectionManager {
  private static connections = new Map<string, WsClient>();

  /**
   * 添加WebSocket连接
   */
  static addConnection(userId: string, wsClient: WsClient): void {
    this.connections.set(userId, wsClient);
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
  }
}
