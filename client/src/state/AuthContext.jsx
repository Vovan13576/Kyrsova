import React, { createContext, useContext, useMemo, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user");
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  });

  const login = (payload) => {
    const t = payload?.token || payload?.accessToken || "";
    const u = payload?.user || payload?.profile || null;

    if (t) localStorage.setItem("token", t);
    else localStorage.removeItem("token");

    if (u) localStorage.setItem("user", JSON.stringify(u));
    else localStorage.removeItem("user");

    setToken(t);
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken("");
    setUser(null);
  };

  const value = useMemo(() => ({ token, user, isAuthed: !!token, login, logout }), [token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
