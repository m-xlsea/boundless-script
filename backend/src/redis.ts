import Redis from "ioredis";

// 创建Redis连接实例
const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
  password: process.env.REDIS_PASSWORD || undefined, // 如果有密码请取消注释并设置
  // db: 0, // 数据库索引，默认为0
  maxRetriesPerRequest: 3,
  lazyConnect: true, // 延迟连接，避免启动时就连接
});

// 连接事件监听
redis.on("connect", () => {
  console.log("Redis连接成功");
});

redis.on("error", (err) => {
  console.error("Redis连接错误:", err);
});

redis.on("close", () => {
  console.log("Redis连接已关闭");
});

// 导出Redis实例
export default redis;
