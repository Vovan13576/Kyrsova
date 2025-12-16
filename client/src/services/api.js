// client/src/services/api.js

// API base (з /api)
const API_BASE_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_URL) ||
  "http://localhost:5000/api";

// ✅ треба для Analyze.jsx: базовий URL сервера БЕЗ /api
export function getServerBaseUrl() {
  // прибираємо /api або /api/
  return String(API_BASE_URL).replace(/\/api\/?$/i, "");
}

// (може бути корисно в інших місцях)
export function getApiBaseUrl() {
  return API_BASE_URL;
}

function getToken() {
  return (
    localStorage.getItem("pdw_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    ""
  );
}

export function getErrorMessage(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  return err?.message || err?.error || "Unknown error";
}

async function parseResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await res.json().catch(() => ({}));
  }
  const text = await res.text().catch(() => "");
  return text ? { message: text } : {};
}

async function request(method, path, body, opts = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
  const token = getToken();

  const headers = {
    ...(opts.headers || {}),
  };

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  if (!isFormData && body !== undefined && body !== null) {
    headers["Content-Type"] = "application/json";
  }

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const fetchOptions = {
    method,
    headers,
    credentials: "include",
    ...opts,
  };

  if (body !== undefined && body !== null) {
    fetchOptions.body = isFormData ? body : JSON.stringify(body);
  }

  console.log("API >", method, url);

  const res = await fetch(url, fetchOptions);
  const data = await parseResponse(res);

  if (!res.ok) {
    const msg =
      data?.message ||
      data?.error ||
      `HTTP ${res.status} ${res.statusText}` ||
      "Request failed";
    const e = new Error(msg);
    e.status = res.status;
    e.data = data;
    throw e;
  }

  return data;
}

// Named exports (для import { apiPost } ...)
export const apiGet = (path, opts) => request("GET", path, undefined, opts);
export const apiPost = (path, body, opts) => request("POST", path, body, opts);
export const apiPut = (path, body, opts) => request("PUT", path, body, opts);
export const apiDelete = (path, opts) => request("DELETE", path, undefined, opts);

// FormData helpers (для Analyze.jsx: api.postForm(...))
export const apiPostForm = (path, formData, opts) =>
  request("POST", path, formData, opts);

export const apiPutForm = (path, formData, opts) =>
  request("PUT", path, formData, opts);

// Default export (для import api from ...; api.postForm(...))
const api = {
  get: apiGet,
  post: apiPost,
  put: apiPut,
  delete: apiDelete,
  del: apiDelete,

  postForm: apiPostForm,
  putForm: apiPutForm,
};

export default api;
