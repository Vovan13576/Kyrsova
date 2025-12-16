// client/src/services/api.js
const API_BASE =
  import.meta.env.VITE_API_URL?.trim() ||
  "http://localhost:5000/api";

function buildUrl(path) {
  if (!path) return API_BASE;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

function getToken() {
  return (
    localStorage.getItem("pdw_token") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("token") ||
    ""
  );
}

function makeHeaders(extra) {
  const h = { ...(extra || {}) };
  const token = getToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function request(method, path, body, headers) {
  const res = await fetch(buildUrl(path), {
    method,
    headers: makeHeaders(headers),
    body,
  });

  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");

  const data = isJson ? await res.json().catch(() => null) : await res.text().catch(() => "");

  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ||
      (typeof data === "string" && data) ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// ---- named helpers that your components expect ----
export function getServerBaseUrl() {
  // turns "http://localhost:5000/api" -> "http://localhost:5000"
  return API_BASE.replace(/\/api\/?$/i, "");
}

export function getErrorMessage(e) {
  if (!e) return "Невідома помилка";
  return (
    e?.data?.message ||
    e?.data?.error ||
    e?.message ||
    (typeof e === "string" ? e : "Помилка")
  );
}

// ---- main api object ----
const api = {
  get: (path) => request("GET", path),
  post: (path, json) =>
    request("POST", path, JSON.stringify(json ?? {}), {
      "Content-Type": "application/json",
    }),
  put: (path, json) =>
    request("PUT", path, JSON.stringify(json ?? {}), {
      "Content-Type": "application/json",
    }),
  del: (path) => request("DELETE", path),
  postForm: (path, formData) => request("POST", path, formData),
};

export default api;

// extra named exports (для сумісності з твоїми файлами типу Login.jsx)
export const apiGet = api.get;
export const apiPost = api.post;
export const apiPut = api.put;
export const apiDelete = api.del;
export const apiPostForm = api.postForm;
