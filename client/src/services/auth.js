const TOKEN_KEY = "pdw_token";
const USER_KEY = "pdw_user";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
  if (!token) return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthed() {
  return !!getToken();
}

// ✅ для сумісності (у тебе були імпорти setAuth)
export function setAuth(payload) {
  // приймаємо token/accessToken/jwt
  const token = payload?.token || payload?.accessToken || payload?.jwt || "";
  if (token) setToken(token);

  const user = payload?.user || payload?.profile || null;
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getAuthUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
