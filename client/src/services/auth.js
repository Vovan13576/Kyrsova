const TOKEN_KEYS = ["token", "accessToken", "jwt"];
const USER_KEY = "user";

export function setAuth(token, user) {
  const t = String(token || "");
  if (!t) return;

  // ✅ записуємо одразу в кілька ключів (щоб не ламались старі компоненти)
  localStorage.setItem("token", t);
  localStorage.setItem("accessToken", t);
  localStorage.setItem("jwt", t);

  if (user) {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      // ignore
    }
  }
}

export function getToken() {
  for (const k of TOKEN_KEYS) {
    const v = localStorage.getItem(k);
    if (v && String(v).trim().length > 0) return v;
  }
  return null;
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isAuthed() {
  return Boolean(getToken());
}

export function clearAuth() {
  for (const k of TOKEN_KEYS) localStorage.removeItem(k);
  localStorage.removeItem(USER_KEY);
}
