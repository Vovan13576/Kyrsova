// client/src/services/api.js
import { getToken, clearAuth } from "./auth.js";

const BASE_URL = import.meta?.env?.VITE_API_URL || "http://localhost:5000/api";

function joinUrl(base, path) {
  if (!path) return base;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/")) return `${base}${path}`;
  return `${base}/${path}`;
}

export function getErrorMessage(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;

  // наш кинутий об’єкт
  if (err.message) return err.message;

  // fetch error
  if (err.name === "TypeError") return "Network error (сервер недоступний?)";

  return "Unknown error";
}

async function request(method, path, { json, formData } = {}) {
  const url = joinUrl(BASE_URL, path);

  const token = getToken();
  const headers = {};

  if (token) headers.Authorization = `Bearer ${token}`;

  let body = undefined;
  if (formData) {
    body = formData; // НЕ ставимо Content-Type, браузер сам поставить boundary
  } else if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  console.log("API >", method, url);

  const res = await fetch(url, {
    method,
    headers,
    body,
    credentials: "include",
  });

  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }

  console.log("API <", res.status, method, path, data);

  if (res.status === 401) {
    // якщо токен протух/невалідний — очищаємо, щоб UI не “брехав”
    clearAuth();
  }

  if (!res.ok) {
    const msg =
      (data && (data.message || data.error || data.err)) ||
      `HTTP ${res.status}`;

    throw {
      status: res.status,
      message: msg,
      data,
    };
  }

  return data;
}

const api = {
  get: (path) => request("GET", path),
  post: (path, json) => request("POST", path, { json }),
  put: (path, json) => request("PUT", path, { json }),
  del: (path) => request("DELETE", path),
  postForm: (path, formData) => request("POST", path, { formData }),
};

export default api;
