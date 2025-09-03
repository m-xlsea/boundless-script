const Accounts = [
  {
    username: 'andiliba',
    password: 'zsm85887823',
  },
];
class HttpTool {
  constructor(baseURL = '') {
    this.baseURL = baseURL;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'HttpTool/1.0',
    };
  }

  // 设置默认请求头
  setDefaultHeaders(headers) {
    this.defaultHeaders = { ...this.defaultHeaders, ...headers };
  }

  // 添加默认请求头
  addDefaultHeader(key, value) {
    this.defaultHeaders[key] = value;
  }

  // GET请求
  async get(url, params = {}, headers = {}) {
    try {
      // 构建完整URL
      const fullURL = this.buildURL(url, params);

      // 合并请求头
      const requestHeaders = { ...this.defaultHeaders, ...headers };

      //console.log(`GET请求: ${fullURL}`);
      //console.log('请求头:', requestHeaders);

      const response = await fetch(fullURL, {
        method: 'GET',
        headers: requestHeaders,
        mode: 'cors',
      });

      return await this.handleResponse(response);
    } catch (error) {
      console.error('GET请求失败:', error);
      throw error;
    }
  }

  // POST请求
  async post(url, data = {}, headers = {}) {
    try {
      // 构建完整URL
      const fullURL = this.buildURL(url);

      // 合并请求头
      const requestHeaders = { ...this.defaultHeaders, ...headers };

      //console.log(`POST请求: ${fullURL}`);
      //console.log('请求数据:', data);
      //console.log('请求头:', requestHeaders);

      const response = await fetch(fullURL, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(data),
        mode: 'cors',
      });

      return await this.handleResponse(response);
    } catch (error) {
      console.error('POST请求失败:', error);
      throw error;
    }
  }

  // 构建完整URL
  buildURL(url, params = {}) {
    let fullURL;

    if (url.startsWith('http')) {
      fullURL = url;
    } else {
      // 处理baseURL和url的拼接，避免双斜杠
      if (this.baseURL.endsWith('/') && url.startsWith('/')) {
        fullURL = this.baseURL + url.substring(1);
      } else if (!this.baseURL.endsWith('/') && !url.startsWith('/')) {
        fullURL = this.baseURL + '/' + url;
      } else {
        fullURL = this.baseURL + url;
      }
    }

    if (Object.keys(params).length > 0) {
      const queryString = new URLSearchParams(params).toString();
      fullURL += (fullURL.includes('?') ? '&' : '?') + queryString;
    }

    return fullURL;
  }

  // 处理响应
  async handleResponse(response) {
    const responseData = {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      url: response.url,
      ok: response.ok,
    };

    try {
      // 尝试解析JSON
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        responseData.data = await response.json();
      } else {
        responseData.data = await response.text();
      }
    } catch (error) {
      responseData.data = null;
      responseData.parseError = error.message;
    }

    if (!response.ok) {
      throw new Error(`HTTP错误 ${response.status}: ${response.statusText}`);
    }

    return responseData;
  }
}

const apiUrl = 'https://boundless.wenzi.games/api/';
const http = new HttpTool(apiUrl);
let bossid = '';
let challengeId = '';

class WSSConnection {
  constructor(url, clientId) {
    this.url = url;
    this.clientId = clientId;
    this.ws = null;
    this.isConnected = false;
    this.challengeId = '';
    this.token = '';
    this.wsAuth = '';
  }

  // 连接方法
  connect() {
    try {
      http.post('/auth/login', Accounts[this.clientId - 1]).then((res) => {
        if (res.data.message == '登录成功') {
          this.token = `Bearer ${res.data.token}`;
          this.wsAuth = `40{"token":"${res.data.token}"}`;
          console.log('客户端' + this.clientId + ' 登录成功', res.data);

          console.log(`客户端${this.clientId} 正在连接到: ${this.url}`);
          this.ws = new WebSocket(this.url);

          // 设置事件监听器
          this.ws.onopen = this.onopen.bind(this);
          this.ws.onmessage = this.onmessage.bind(this);
          this.ws.onclose = this.onclose.bind(this);
          this.ws.onerror = this.onerror.bind(this);
          setInterval(() => {
            http.get('/worldboss/current', {}, { Authorization: this.token }).then((res) => {
              if (res.data.boss == null) return;
              const bossData = res.data.boss;
              //console.log('当前的世界boss是', bossData);
              if (bossData._id != bossid) {
                //console.log(bossData._id);
                bossid = bossData._id;
                console.log('更换boss', bossid);
                http.post('worldboss/' + bossid + '/challenge', {}, { Authorization: this.token }).then((res) => {
                  if (res.data.success) {
                    challengeId = res.data.challengeId;
                    console.log('世界boss的challengeId获取成功', challengeId);
                  }
                });
              }
            });
          }, 500);
        } else {
          return;
        }
      });
    } catch (error) {
      console.error(`客户端${this.clientId} 连接失败:`, error);
    }
  }

  // 连接打开
  onopen(event) {
    console.log(`客户端${this.clientId} WSS连接已建立`);
    this.isConnected = true;
  }

  // 接收消息
  onmessage(event) {}

  // 连接关闭
  onclose(event) {
    console.log(`客户端${this.clientId} WSS连接已关闭:`, event.code, event.reason);
    this.isConnected = false;
  }

  // 连接错误
  onerror(error) {
    console.error(`客户端${this.clientId} WSS连接错误:`, error);
  }

  // 发送消息
  send(data) {
    this.ws.send(data);
    return false;
  }
  // 关闭连接
  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// 创建1个客户端
// 这边改启动的客户端数量
const clients = [];
const clientCount = 1;

for (let i = 1; i <= clientCount; i++) {
  const wss = new WSSConnection('wss://boundless.wenzi.games/socket.io/?EIO=4&transport=websocket', i);

  wss.onopen = function (event) {
    console.log(`客户端${i} 连接已建立`);
    wss.send(wss.wsAuth);
    setInterval(() => {
      if (wss.challengeId != challengeId) {
        wss.challengeId = challengeId;
        console.log('客户端' + this.clientId, '准备进入世界boss战斗', challengeId);
        wss.send(`42["startWorldBossBattle",{"worldBossId":"${bossid}","challengeId":"${challengeId}"}]`);
      }
    }, 1000);
  };

  // 重写onmessage方法
  wss.onmessage = function (event) {
    const data = event.data;

    switch (data) {
      case '2':
        wss.send('3');
        break;
      default:
    }
  };
  // 将客户端添加到数组
  clients.push(wss);
}
clients[0].connect();
