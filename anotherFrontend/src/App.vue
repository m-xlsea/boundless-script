<script setup>
import { ref, watch, onMounted } from "vue";
import {
  NCard,
  NForm,
  NFormItem,
  NInput,
  NButton,
  NSelect,
  createDiscreteApi,
  NCheckbox,
  NPopover,
} from "naive-ui";

const { message } = createDiscreteApi(["message", "dialog", "notification", "loadingBar", "modal"]);

const formRef = ref();
const retryCount = ref(0);
const isLogin = ref(true);
const isStart = ref(false);
const isStop = ref(false);
const isError = ref(false);
const autoLogin = ref(false);
const logIntervalTime = ref(5000);
const logIntervalOptions = ref([
  { label: "5秒", value: 5000 },
  { label: "10秒", value: 10000 },
  { label: "15秒", value: 15000 },
  { label: "30秒", value: 30000 },
  { label: "1分钟", value: 60000 },
  { label: "5分钟", value: 120000 },
  { label: "10分钟", value: 600000 },
  { label: "30分钟", value: 1800000 },
  { label: "1小时", value: 3600000 },
]);
const logKeepCount = ref(100);
const logKeepCountOptions = ref([
  { label: "20条", value: 20 },
  { label: "50条", value: 50 },
  { label: "100条", value: 100 },
  { label: "500条", value: 500 },
  { label: "1000条", value: 1000 },
]);
const maxRetryCount = ref(3);
const maxRetryCountOptions = ref([
  { label: "3次", value: 3 },
  { label: "5次", value: 5 },
  { label: "10次", value: 10 },
  { label: "无限重连", value: -1 },
]);
const battleLog = ref([]);
const worldLog = ref([]);

const model = ref({
  username: "",
  password: "",
});

const rules = ref({
  username: [{ required: true, message: "请输入用户名" }],
  password: [{ required: true, message: "请输入密码" }],
});

let websocket = null;
let logInterval = null;

onMounted(() => {
  if (window.localStorage.getItem("autoLogin")) {
    autoLogin.value = true;
    model.value.username = window.localStorage.getItem("username");
    model.value.password = window.localStorage.getItem("password");
    handleLogin();
  }
});

const handleLogin = async () => {
  await formRef.value?.validate();

  const response = await fetch(
    `http://${import.meta.env.VITE_HOST ? import.meta.env.VITE_HOST : "139.196.230.61:3333"}/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(model.value),
    }
  );
  const res = await response.json();
  if (response.status !== 200) {
    message.error(res.error);
    return;
  }
  if (autoLogin.value) {
    window.localStorage.setItem("autoLogin", true);
    window.localStorage.setItem("username", model.value.username);
    window.localStorage.setItem("password", model.value.password);
  } else {
    window.localStorage.removeItem("autoLogin");
    window.localStorage.removeItem("username");
    window.localStorage.removeItem("password");
  }
  isLogin.value = true;
  message.success(res.message);
};

function sendLogEnent() {
  setTimeout(() => {
    websocket.send(JSON.stringify({ event: "log" }));
  }, 100);
  setTimeout(() => {
    websocket.send(JSON.stringify({ event: "battlelog" }));
  }, 100);
}

function websocketReconnect() {
  setTimeout(() => {
    if (retryCount.value < maxRetryCount.value || maxRetryCount.value === -1) {
      retryCount.value = retryCount.value + 1;
      initWebSocket();
    } else {
      websocket = null;
      clearInterval(logInterval);
      worldLog.value = [];
      battleLog.value = [];
      isStart.value = false;
      message.error("websocket 重连失败，已达最大重连次数");
    }
  }, 5000);
}

function websocketOnOpen() {
  websocket.onopen = () => {
    retryCount.value = 0;
    isError.value = false;
    message.success("websocket 连接成功");
    websocket.send(
      JSON.stringify({
        event: "connect",
        data: { username: model.value.username, password: model.value.password },
      })
    );
    sendLogEnent();
    logInterval = setInterval(() => {
      sendLogEnent();
    }, logIntervalTime.value);
  };
}

function websocketOnMessage() {
  websocket.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.event === "log") {
      worldLog.value = Array.from(new Set(worldLog.value.concat(data.data)));
      worldLog.value.sort((a, b) => {
        const aTime = a.includes("PM") ? `${a.split("PM")[0]}PM` : `${a.split("AM")[0]}AM`;
        const bTime = b.includes("PM") ? `${b.split("PM")[0]}PM` : `${b.split("AM")[0]}AM`;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });
      worldLog.value = worldLog.value.reverse();
      if (worldLog.value.length > logKeepCount.value) {
        worldLog.value = worldLog.value.slice(logKeepCount.value, worldLog.value.length);
      }
      return;
    }
    if (data.event === "battlelog") {
      battleLog.value = Array.from(new Set(battleLog.value.concat(data.data)));
      battleLog.value.sort((a, b) => {
        return new Date(b[0]).getTime() - new Date(a[0]).getTime();
      });
      battleLog.value = battleLog.value.reverse();
      if (battleLog.value.length > logKeepCount.value) {
        battleLog.value = battleLog.value.slice(logKeepCount.value, battleLog.value.length);
      }
    }
  };
}

function websocketOnClose() {
  websocket.onclose = (e) => {
    console.warn("websocket 断开连接", e);
    message.warning("websocket 断开连接");
    clearInterval(logInterval);
    isError.value = false;
    if (!isStop.value && !isError.value) {
      isStop.value = false;
      websocketReconnect();
    } else {
      isStop.value = false;
    }
  };
}

function websocketOnError() {
  websocket.onclose = (e) => {
    console.warn("websocket 连接失败", e);
    message.warning("websocket 连接失败");
    isError.value = true;
    websocketReconnect();
  };
}

function initWebSocket() {
  websocket = new WebSocket(`ws://${import.meta.env.VITE_WS_HOST || "139.196.230.61:3333"}/ws`);
  websocketOnOpen();
  websocketOnMessage();
  websocketOnError();
  websocketOnClose();
}

function handleStart() {
  retryCount.value = 0;
  initWebSocket();
  isStart.value = true;
}

async function handleStop() {
  const response = await fetch(
    `http://${import.meta.env.VITE_WS_HOST || "139.196.230.61:3333"}/stopbattle`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(model.value),
    }
  );
  const res = await response.json();
  if (response.status !== 200) {
    message.error(res.error);
    return;
  }

  websocket.close();
  websocket = null;
  clearInterval(logInterval);
  isStart.value = false;
  isStop.value = true;
  message.success(res.message);
}

function handleLogout() {
  worldLog.value = [];
  battleLog.value = [];
  isLogin.value = false;
}

function handleClearLog() {
  worldLog.value = [];
  battleLog.value = [];
}

watch(logIntervalTime, () => {
  clearInterval(logInterval);
  logInterval = setInterval(() => {
    sendLogEnent();
  }, logIntervalTime.value);
});
</script>

<template>
  <div class="size-full">
    <div v-if="!isLogin" class="flex justify-center items-center size-full">
      <NCard title="登录" class="w-360px">
        <NForm ref="formRef" :model="model" :rules="rules">
          <NFormItem label="用户名" path="username">
            <NInput v-model:value="model.username" placeholder="请输入用户名" />
          </NFormItem>
          <NFormItem label="密码" path="password">
            <NInput v-model:value="model.password" type="password" show-password-on="click" placeholder="请输入密码" />
          </NFormItem>
        </NForm>
        <NCheckbox class="mb-16px" v-model:checked="autoLogin">自动登录</NCheckbox>
        <NButton type="primary" @click="handleLogin" block>登录</NButton>
      </NCard>
    </div>
    <div v-else class="flex flex-col justify-center items-center size-full gap-12px">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-16px p-12px">
        <div class="flex justify-start items-center gap-3px">
          <span>日志刷新时间：</span>
          <NSelect class="w-120px" v-model:value="logIntervalTime" :options="logIntervalOptions" />
        </div>
        <div class="flex justify-start items-center gap-3px">
          <span>日志保留条数：</span>
          <NSelect class="w-120px" v-model:value="logKeepCount" :options="logKeepCountOptions" />
        </div>
        <div class="flex justify-start items-center gap-3px">
          <span>重连次数：</span>
          <NSelect class="w-120px" v-model:value="maxRetryCount" :options="maxRetryCountOptions" />
        </div>
        <NButton v-if="!isStart" type="primary" @click="handleStart">开始挂机</NButton>
        <NButton v-if="isStart" type="error" @click="handleStop">停止挂机</NButton>
        <NButton v-if="!isStart" type="error" @click="handleLogout">退出登录</NButton>
        <NButton type="warning" @click="handleClearLog">清空日志</NButton>
      </div>
      <NCard title="战斗日志" class="h-full flex-1">
        <div v-if="battleLog.length > 0" class="h-30vh overflow-auto scrollbar">
          <NPopover :disabled="!item[2].length" class="mb-5px" v-for="item in battleLog" :key="item.key"
            placement="top-start" trigger="click">
            <template #trigger>
              <div>
                <span> {{ item[0] }}</span>
                <span class="ml-5px"> {{ item[1] }}</span>
                <span class="ml-5px">造成了 {{ item[3] }} 点伤害</span>
                <span class="ml-5px">boss 剩余 {{ item[4] }}({{ ((item[4] / item[5]) * 100).toFixed(2) }}%)
                  点血量</span>
              </div>
            </template>
            {{ item[2] }}
          </NPopover>
        </div>
      </NCard>
      <NCard title="世界日志" class="h-full flex-1">
        <div v-if="worldLog.length > 0" class="h-30vh overflow-auto scrollbar">
          <div class="mb-5px" v-for="item in worldLog" :key="item.key">{{ item }}</div>
        </div>
      </NCard>
    </div>
  </div>
  <div class="fixed bottom-0 left-0 right-0 text-center text-gray-500 text-sm">
    感谢 <span class="rainbow-text">马铃薯头</span> 提供的前端代码!
  </div>
</template>

<style scoped>
.scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.5) transparent;

  &::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.5);
    border-radius: 7px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background-color: rgba(0, 0, 0, 0.5);
    border-radius: 7px;
  }

  &::-webkit-scrollbar {
    width: 7px;
    height: 7px;
  }

  &::-webkit-scrollbar-track-piece {
    background-color: rgba(0, 0, 0, 0);
    border-radius: 0;
  }
}

.rainbow-text {
  background: linear-gradient(90deg,
      #ff0000,
      #ff8c00,
      #ffd700,
      #32cd32,
      #00bfff,
      #4169e1,
      #8a2be2,
      #ff1493,
      #ff0000);
  background-size: 200% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  font-weight: bold;
  display: inline-block;
  animation: rainbow-shift 3s ease-in-out infinite;
}

@keyframes rainbow-shift {
  0% {
    background-position: 0% 50%;
  }

  50% {
    background-position: 100% 50%;
  }

  100% {
    background-position: 0% 50%;
  }
}
</style>
