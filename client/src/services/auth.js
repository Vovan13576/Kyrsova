// client/src/services/auth.js

const KEY_TOKEN = "token";
const KEY_USER = "user";

// Для сумісності з тим, що могло бути раніше
const ALT_KEYS = ["accessToken", "jwt"];

export function setAuth(token, user) {
  if (!token) return;

  localStorage.setItem(KEY_TOKEN, token);
  // дублюємо — щоб старий код/перевірки не ламались
  localStorage.setItem("accessToken", token);
  localStorage.setItem("jwt", token);

  if (user) {
    localStorage.setItem(KEY_USER, JSON.stringify(user));
  }
}

export function getToken() {
  const t = localStorage.getItem(KEY_TOKEN);
  if (t) return t;

  for (const k of ALT_KEYS) {
    const v = localStorage.getItem(k);
    if (v) return v;
  }
  return null;
}

export function isAuthed() {
  return Boolean(getToken());
}

export function getUser() {
  try {
    const raw = localStorage.getItem(KEY_USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearAuth() {
  localStorage.removeItem(KEY_TOKEN);
  localStorage.removeItem(KEY_USER);
  for (const k of ALT_KEYS) localStorage.removeItem(k);
}
