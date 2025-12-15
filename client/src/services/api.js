import axios from "axios";
import { getToken } from "./auth";

const API_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: false,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function getErrorMessage(err) {
  // axios error
  const data = err?.response?.data;
  if (typeof data === "string") return data;
  if (data?.error) return data.error;
  if (data?.message) return data.message;

  const status = err?.response?.status;
  if (status) return `Помилка сервера (${status})`;

  if (err?.message) return err.message;
  return "Невідома помилка";
}

export default api;
