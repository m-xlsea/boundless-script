import { UserDataService } from "./userDataService";
import { WSConnectionManager } from "./wsConnectionManager";
import { WsClient } from "./wsclient";
import { post } from "./httptool";
import { getTime } from "./globalData";

export class StartupService {
  /**
   * 程序启动时恢复Redis中的用户数据
   */
  static async recoverUsersFromRedis(): Promise<void> {
    try {
      console.log("🔄 开始从Redis恢复用户数据...");

      const allUserIds = await UserDataService.getAllUserIds();
      if (allUserIds.length === 0) {
        console.log("📝 Redis中没有找到用户数据");
        return;
      }

      console.log(`📊 找到 ${allUserIds.length} 个用户账户，开始恢复...`);

      let onlineCount = 0;
      let offlineCount = 0;
      let reconnectedCount = 0;

      for (const userId of allUserIds) {
        const userData = await UserDataService.getUserData(userId);
        if (!userData) {
          console.log(`⚠️  用户 ${userId} 数据损坏，跳过`);
          continue;
        }

        console.log(`🔍 处理用户: ${userData.username} (状态: ${userData.status})`);

        if (userData.status === "online") {
          // 之前是在线状态，尝试重新连接
          const reconnected = await this.attemptReconnectUser(userId, userData);
          if (reconnected) {
            reconnectedCount++;
            console.log(`✅ 用户 ${userData.username} 重新连接成功`);
          } else {
            // 重连失败，设置为离线
            await UserDataService.updateUserStatus(userId, "offline");
            await UserDataService.addLog(userId, getTime() + " " + userData.username + " 启动时重连失败，设为离线");
            offlineCount++;
            console.log(`❌ 用户 ${userData.username} 重连失败，设为离线`);
          }
        } else {
          // 之前是离线状态，保持离线
          offlineCount++;
          console.log(`📴 用户 ${userData.username} 保持离线状态`);
        }
        //延迟1000ms
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      console.log(`🎉 用户数据恢复完成:`);
      console.log(`   - 重新连接: ${reconnectedCount} 个用户`);
      console.log(`   - 保持离线: ${offlineCount} 个用户`);
      console.log(`   - 总计: ${allUserIds.length} 个用户`);
    } catch (error) {
      console.error("❌ 恢复用户数据时发生错误:", error);
    }
  }

  /**
   * 尝试重新连接用户
   */
  private static async attemptReconnectUser(userId: string, userData: any): Promise<boolean> {
    try {
      // 检查是否已经有连接了
      const existingConnection = WSConnectionManager.getConnection(userId);
      if (existingConnection) {
        console.log(`🔗 用户 ${userData.username} 已有连接，跳过重连`);
        return true;
      }

      // 如果用户设置了停止战斗，不自动重连
      if (userData.stopBattle) {
        console.log(`⏹️  用户 ${userData.username} 已停止战斗，不自动重连`);
        return false;
      }

      // 尝试重新登录获取新token
      const loginRes = (await post("https://boundless.wenzi.games/api/auth/login", {
        username: userData.username,
        password: userData.password,
      })) as any;

      if (loginRes.error) {
        console.log(`🚫 用户 ${userData.username} 登录失败: ${loginRes.error}`);
        return false;
      }

      // 更新用户数据
      userData.token = loginRes.token;
      userData.status = "online";
      await UserDataService.saveUserData(userId, userData);
      await UserDataService.addLog(userId, getTime() + " " + userData.username + " 启动时自动重连成功");

      // 创建WebSocket连接
      const wsClient = new WsClient(userId, loginRes.token);
      WSConnectionManager.addConnection(userId, wsClient);

      // 延迟连接，避免同时连接太多
      setTimeout(() => {
        wsClient.connect();
      }, Math.random() * 3000); // 0-3秒随机延迟

      return true;
    } catch (error) {
      console.error(`❌ 重连用户 ${userData.username} 失败:`, error);
      return false;
    }
  }

  /**
   * 清理Redis中的无效数据（可选）
   */
  static async cleanupInvalidData(): Promise<void> {
    try {
      console.log("🧹 开始清理无效数据...");

      const allUserIds = await UserDataService.getAllUserIds();
      let cleanedCount = 0;

      for (const userId of allUserIds) {
        const userData = await UserDataService.getUserData(userId);

        // 检查数据完整性
        if (!userData || !userData.username || !userData.password) {
          console.log(`🗑️  删除无效用户数据: ${userId}`);
          await UserDataService.deleteUserData(userId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`✨ 清理完成，删除了 ${cleanedCount} 个无效数据`);
      } else {
        console.log("✅ 没有发现无效数据");
      }
    } catch (error) {
      console.error("❌ 清理数据时发生错误:", error);
    }
  }

  /**
   * 获取恢复统计信息
   */
  static async getRecoveryStats(): Promise<{
    totalUsers: number;
    onlineUsers: number;
    offlineUsers: number;
    activeConnections: number;
  }> {
    try {
      const allUserIds = await UserDataService.getAllUserIds();
      const onlineUserIds = await UserDataService.getOnlineUsers();
      const activeConnections = WSConnectionManager.getOnlineConnectionsCount();

      return {
        totalUsers: allUserIds.length,
        onlineUsers: onlineUserIds.length,
        offlineUsers: allUserIds.length - onlineUserIds.length,
        activeConnections: activeConnections,
      };
    } catch (error) {
      console.error("❌ 获取统计信息失败:", error);
      return {
        totalUsers: 0,
        onlineUsers: 0,
        offlineUsers: 0,
        activeConnections: 0,
      };
    }
  }
}
