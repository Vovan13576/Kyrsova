const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

function getStoredToken() {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("jwt") ||
    ""
  );
}

async function parseResponse(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return await res.json().catch(() => null);
  }
  return await res.text().catch(() => "");
}

async function request(method, path, { body, isForm } = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  const headers = {};
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  if (!isForm) headers["Content-Type"] = "application/json";

  // ✅ консоль-логи (як ти просив)
  console.log(`API > ${method} ${url}`);

  const res = await fetch(url, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  const data = await parseResponse(res);

  console.log(`API < ${res.status} ${method} ${path}`, data || "");

  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && (data.message || data.error)) ||
      res.statusText ||
      "Request failed";
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    err.url = url;
    throw err;
  }

  return data;
}

export function getErrorMessage(e) {
  return (
    e?.data?.message ||
    e?.data?.error ||
    e?.message ||
    "Невідома помилка"
  );
}

const api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, { body }),
  put: (path, body) => request("PUT", path, { body }),
  del: (path) => request("DELETE", path),

  postForm: (path, formData) => request("POST", path, { body: formData, isForm: true }),
};

export default api;
