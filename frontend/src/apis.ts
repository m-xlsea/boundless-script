// 登录相关的类型定义
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  token?: string;
  user?: {
    id: string;
    username: string;
    email?: string;
    avatar?: string;
  };
}

// API基础配置
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// 登录接口
export async function loginApi(credentials: LoginRequest): Promise<LoginResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(credentials),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "登录失败");
    }

    return data;
  } catch (error) {
    console.error("登录请求失败:", error);
    throw error;
  }
}
