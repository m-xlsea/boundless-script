// 简单的 GET 请求
export async function get(url: string, headers?: Record<string, string>): Promise<any> {
  const response = await fetch(url, {
    headers: headers,
  }).catch((error) => {
    console.error("GET请求失败:", error);
    throw error;
  });
  return response.json();
}

// 简单的 POST 请求
export async function post(url: string, data?: any, headers?: Record<string, string>): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: data ? JSON.stringify(data) : undefined,
  }).catch((error) => {
    console.error("POST请求失败:", error);
    throw error;
  });
  return response.json();
}
