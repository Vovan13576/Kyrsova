// client/src/services/api.js
import { getToken, clearAuth } from "./auth.js";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export function getErrorMessage(err) {
  if (!err) return "Невідома помилка";

  // наш throw з apiRequest
  if (typeof err === "object") {
    if (err.data?.message) return err.data.message;
    if (err.data?.error) return err.data.error;
    if (err.message) return err.message;
  }

  if (typeof err === "string") return err;
  return "Сталася помилка";
}

async function apiRequest(method, path, body, options = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  const headers = new Headers(options.headers || {});
  const token = getToken();

  if (token) headers.set("Authorization", `Bearer ${token}`);

  const fetchOptions = {
    method,
    headers,
    credentials: "include",
  };

  // body
  if (body instanceof FormData) {
    fetchOptions.body = body; // Content-Type не ставимо
  } else if (body !== undefined && body !== null) {
    headers.set("Content-Type", "application/json");
    fetchOptions.body = JSON.stringify(body);
  }

  console.log(`API > ${method} ${url}`, body instanceof FormData ? "FormData" : body ?? "");

  const res = await fetch(url, fetchOptions);

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  const data = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");

  if (!res.ok) {
    // якщо токен протух — чистимо
    if (res.status === 401) clearAuth();
    throw { status: res.status, data, message: `HTTP ${res.status}` };
  }

  return data;
}

export const apiGet = (path, options) => apiRequest("GET", path, null, options);
export const apiPost = (path, body, options) => apiRequest("POST", path, body, options);
export const apiPut = (path, body, options) => apiRequest("PUT", path, body, options);
export const apiDelete = (path, body, options) => apiRequest("DELETE", path, body, options);
