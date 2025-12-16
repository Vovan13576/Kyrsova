// client/src/services/auth.js

const KEY_TOKEN_MAIN = "plant_token";
const KEY_USER = "plant_user";

// сумісність зі старими ключами
const TOKEN_KEYS_READ = ["token", "accessToken", "jwt", KEY_TOKEN_MAIN];

export function getToken() {
  for (const k of TOKEN_KEYS_READ) {
    const v = localStorage.getItem(k);
    if (v && typeof v === "string" && v.trim()) return v;
  }
  return null;
}

export function isAuthed() {
  return Boolean(getToken());
}

export function setToken(token) {
  if (!token || typeof token !== "string") return;

  // зберігаємо і в новий ключ, і в “сумісні”
  localStorage.setItem(KEY_TOKEN_MAIN, token);
  localStorage.setItem("token", token);
  localStorage.setItem("accessToken", token);
  localStorage.setItem("jwt", token);
}

export function clearToken() {
  localStorage.removeItem(KEY_TOKEN_MAIN);
  localStorage.removeItem("token");
  localStorage.removeItem("accessToken");
  localStorage.removeItem("jwt");
}

export function setUser(user) {
  try {
    localStorage.setItem(KEY_USER, JSON.stringify(user ?? null));
  } catch {
    // ignore
  }
}

export function getUser() {
  try {
    const raw = localStorage.getItem(KEY_USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearUser() {
  localStorage.removeItem(KEY_USER);
}

/**
 * ✅ СУМІСНІСТЬ для старого коду:
 * Login.jsx / Register.jsx могли викликати setAuth({ token, user }) або setAuth(token, user)
 */
export function setAuth(arg1, arg2) {
  // варіант 1: setAuth({ token, user }) або { accessToken, jwt }
  if (arg1 && typeof arg1 === "object") {
    const token = arg1.token || arg1.accessToken || arg1.jwt || null;
    const user = arg1.user || null;
    if (token) setToken(token);
    if (user) setUser(user);
    return;
  }

  // варіант 2: setAuth(token, user)
  if (typeof arg1 === "string") {
    setToken(arg1);
    if (arg2) setUser(arg2);
  }
}

export function clearAuth() {
  clearToken();
  clearUser();
}

export default {
  getToken,
  isAuthed,
  setToken,
  clearToken,
  setUser,
  getUser,
  clearUser,
  setAuth,
  clearAuth,
};
