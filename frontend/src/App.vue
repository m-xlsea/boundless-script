<script setup lang="ts">
import { ref } from "vue";
import { loginApi } from "./apis";

const username = ref("");
const password = ref("");
const isLogin = ref(false);
const logs = ref<string[]>([]);
const battleSteps = ref<string[]>([]);

// WebSocket 相关状态
const wsConnected = ref(false);
const wsUrl = ref("ws://localhost:3000/ws"); // 默认WebSocket服务器地址
let ws: WebSocket | null = null;

const login = async () => {
  const res = loginApi({
    username: username.value,
    password: password.value,
  })
    .then((res: any) => {
      if (res.message === "登录成功") {
        createLog(res.message);
        createLog("token:" + res.token);
        isLogin.value = true;
        connectWs();
      } else {
        if (res.message === "用户已登录") {
          createLog(res.message);
          isLogin.value = true;
          connectWs();
        } else {
          createLog(res.message);
        }
      }
    })
    .catch((err) => {
      createLog(err);
    });
};

// WebSocket 连接
const connectWs = () => {
  try {
    ws = new WebSocket(wsUrl.value);

    ws.onopen = () => {
      wsConnected.value = true;
      ws?.send(
        JSON.stringify({
          event: "connect",
          data: {
            username: username.value,
            password: password.value,
          },
        })
      );
      setInterval(() => {
        ws?.send(
          JSON.stringify({
            event: "battlelog",
          })
        );
        ws?.send(
          JSON.stringify({
            event: "log",
          })
        );
      }, 5000);
      createLog("WebSocket 连接成功");
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      //createLog("收到消息: " + message.event);
      if (message.event === "battlelog") {
        battleSteps.value = message.data;
      } else if (message.event === "log") {
        logs.value = message.data;
      }
    };

    ws.onclose = () => {
      wsConnected.value = false;
      createLog("WebSocket 连接关闭");
    };

    ws.onerror = (error) => {
      createLog("WebSocket 错误: " + error);
    };
  } catch (error) {
    createLog("连接失败: " + error);
  }
};

// 断开WebSocket连接
const disconnectWs = () => {
  if (ws) {
    ws.close();
    ws = null;
    wsConnected.value = false;
    createLog("主动断开WebSocket连接");
  }
};

// 发送消息
const message = ref("");
const sendMessage = () => {
  if (ws && wsConnected.value && message.value.trim()) {
    ws.send(message.value);
    createLog("发送消息: " + message.value);
    message.value = "";
  } else {
    createLog("WebSocket未连接或消息为空");
  }
};

const connect = () => {
  createLog("开始挂机");
};

const createLog = (log: string) => {
  logs.value.push(new Date().toLocaleString() + " " + log);
  console.log(logs.value.length);
  if (logs.value.length > 10) {
    logs.value.splice(0, logs.value.length - 10);
  }
};
</script>

<template>
  <div style="width: 400px; margin: 0 auto">
    <div v-if="!isLogin">
      <div>登录</div>
      <div style="width: 100%; display: flex; flex-direction: column; gap: 10px">
        <input type="text" v-model="username" />
        <input type="password" v-model="password" />
        <button @click="login">登录</button>
      </div>
    </div>
    <div v-if="isLogin">
      <div>登录成功</div>
      <button @click="connect">开始挂机</button>
      <div>战斗日志</div>
      <div style="word-wrap: break-word; width: 100%; height: 500px; overflow-y: auto">
        <div v-for="(log, index) in battleSteps" :key="index" style="word-wrap: break-word; width: 100%; overflow-y: auto">
          {{ log }}
        </div>
      </div>
    </div>
    <div>日志</div>
    <div style="word-wrap: break-word; width: 100%; height: 500px; overflow-y: auto">
      <div v-for="(log, index) in logs" :key="index" style="word-wrap: break-word; width: 100%">
        {{ log }}
      </div>
    </div>
  </div>
</template>

<style scoped></style>
