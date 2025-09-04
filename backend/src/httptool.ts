import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

// 创建 axios 实例，配置默认参数
const httpClient: AxiosInstance = axios.create({
  timeout: 10000, // 10秒超时
  headers: {
    "Content-Type": "application/json",
  },
});

// 响应拦截器 - 只输出简洁的错误信息
httpClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error) => {
    if (error.response) {
      // 直接抛出响应数据，保持简洁
      return Promise.reject(error.response.data);
    } else if (error.request) {
      // 网络错误
      return Promise.reject({ error: "网络错误" });
    } else {
      // 请求配置错误
      return Promise.reject({ error: "请求错误" });
    }
  }
);

// 重试函数
async function retryRequest<T>(requestFn: () => Promise<T>, maxRetries: number = 1, delay: number = 1000): Promise<T> {
  let lastError: Error;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error as Error;

      if (i === maxRetries) {
        throw lastError;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2; // 指数退避
    }
  }

  throw lastError!;
}

// GET 请求
export async function get(url: string, headers?: Record<string, string>, config?: AxiosRequestConfig): Promise<any> {
  return retryRequest(async () => {
    const response = await httpClient.get(url, {
      headers,
      ...config,
    });
    return response.data;
  });
}

// POST 请求
export async function post(url: string, data?: any, headers?: Record<string, string>, config?: AxiosRequestConfig): Promise<any> {
  return retryRequest(async () => {
    const response = await httpClient.post(url, data, {
      headers,
      ...config,
    });
    return response.data;
  });
}

// PUT 请求
export async function put(url: string, data?: any, headers?: Record<string, string>, config?: AxiosRequestConfig): Promise<any> {
  return retryRequest(async () => {
    const response = await httpClient.put(url, data, {
      headers,
      ...config,
    });
    return response.data;
  });
}

// DELETE 请求
export async function del(url: string, headers?: Record<string, string>, config?: AxiosRequestConfig): Promise<any> {
  return retryRequest(async () => {
    const response = await httpClient.delete(url, {
      headers,
      ...config,
    });
    return response.data;
  });
}

// 导出 axios 实例，方便需要更复杂配置的场景
export { httpClient };
