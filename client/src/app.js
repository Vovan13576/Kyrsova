const API_BASE =
  import.meta.env.VITE_API_BASE?.trim() || "http://localhost:5000/api";

function getToken() {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("jwt") ||
    ""
  );
}

export function getErrorMessage(err, fallback = "Помилка") {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (err?.message) return err.message;
  return fallback;
}

async function request(method, url, body, opts = {}) {
  const token = getToken();
  const headers = { ...(opts.headers || {}) };

  // якщо body FormData — НЕ ставимо Content-Type
  const isFormData = body instanceof FormData;

  if (!isFormData && body !== undefined && body !== null) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;

  console.log("API >", method, fullUrl, isFormData ? "FormData" : body ?? "");

  const res = await fetch(fullUrl, {
    method,
    headers,
    body: body == null ? undefined : isFormData ? body : JSON.stringify(body),
  });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  const data = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);

  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && (data.message || data.error)) ||
      (typeof data === "string" && data) ||
      `HTTP ${res.status}`;
    const e = new Error(msg);
    e.status = res.status;
    e.data = data;
    throw e;
  }

  return data;
}

export const apiGet = (url, opts) => request("GET", url, null, opts);
export const apiPost = (url, body, opts) => request("POST", url, body, opts);
export const apiPut = (url, body, opts) => request("PUT", url, body, opts);
export const apiDelete = (url, opts) => request("DELETE", url, null, opts);

// для сумісності зі старими імпортами (якщо десь було)
export const api = { apiGet, apiPost, apiPut, apiDelete, getErrorMessage };
