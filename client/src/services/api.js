import { getToken, clearToken } from "./auth";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const SERVER_BASE = API_BASE.replace(/\/api\/?$/i, "");

// щоб формувати URL до /uploads
export function getServerBaseUrl() {
  return SERVER_BASE;
}

export function getErrorMessage(e) {
  if (!e) return "Помилка";
  if (typeof e === "string") return e;
  if (e?.message) return e.message;
  return "Помилка";
}

async function readJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function request(method, url, body, { isForm = false } = {}) {
  const token = getToken();

  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!isForm) headers["Content-Type"] = "application/json";

  const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;

  try {
    // eslint-disable-next-line no-console
    console.log("API >", method, fullUrl, isForm ? "FormData" : body ?? "");
  } catch {}

  const res = await fetch(fullUrl, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
  }

  const data = await readJsonSafe(res);

  if (!res.ok) {
    const msg = data?.message || data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

// ✅ Backward-compatible named exports (щоб старі файли типу Login.jsx не ламались)
export const apiGet = (url) => request("GET", url);
export const apiPost = (url, body) => request("POST", url, body);
export const apiPut = (url, body) => request("PUT", url, body);
export const apiDelete = (url) => request("DELETE", url);
export const apiPostForm = (url, formData) => request("POST", url, formData, { isForm: true });

// ✅ Default export теж залишаємо (для нового коду)
const api = {
  get: apiGet,
  post: apiPost,
  put: apiPut,
  del: apiDelete,
  postForm: apiPostForm,
};

export default api;
