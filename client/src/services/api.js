import { getToken } from "./auth.js";

const RAW_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

function normalizeUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${RAW_BASE}${p}`;
}

export function getErrorMessage(errOrResponse) {
  if (!errOrResponse) return "Невідома помилка";
  if (typeof errOrResponse === "string") return errOrResponse;

  // якщо це fetch Response
  if (errOrResponse instanceof Response) return `HTTP ${errOrResponse.status}`;

  if (errOrResponse.message) return errOrResponse.message;
  return "Помилка";
}

async function request(method, path, { data, isForm = false, headers = {} } = {}) {
  const token = getToken();
  const url = normalizeUrl(path);

  const finalHeaders = { ...headers };
  if (token) finalHeaders.Authorization = `Bearer ${token}`;

  let body = undefined;

  if (data !== undefined) {
    if (isForm) {
      body = data; // FormData
    } else {
      finalHeaders["Content-Type"] = "application/json";
      body = JSON.stringify(data);
    }
  }

  const res = await fetch(url, { method, headers: finalHeaders, body });

  let payload = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    payload = await res.json().catch(() => null);
  } else {
    payload = await res.text().catch(() => null);
  }

  if (!res.ok) {
    const msg =
      payload?.message || payload?.error || (typeof payload === "string" ? payload : null) || `HTTP ${res.status}`;
    const e = new Error(msg);
    e.status = res.status;
    e.payload = payload;
    throw e;
  }

  return payload;
}

const api = {
  get: (path) => request("GET", path),
  post: (path, data) => request("POST", path, { data }),
  put: (path, data) => request("PUT", path, { data }),
  del: (path) => request("DELETE", path),
  postForm: (path, formData) => request("POST", path, { data: formData, isForm: true }),
};

export default api;
export { api };
