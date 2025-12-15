import { api, tryRequest } from "./api.js";

export async function fetchHistory() {
  return tryRequest([
    () => api.get("/api/history"),
    () => api.get("/api/analysis/history"),
    () => api.get("/api/analyze/history")
  ]);
}
