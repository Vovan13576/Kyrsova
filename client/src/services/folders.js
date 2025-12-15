import { api, tryRequest } from "./api.js";

export async function fetchFolders() {
  return tryRequest([
    () => api.get("/api/folder"),
    () => api.get("/api/folders")
  ]);
}

export async function createFolder(name) {
  return tryRequest([
    () => api.post("/api/folder", { name }),
    () => api.post("/api/folders", { name })
  ]);
}
