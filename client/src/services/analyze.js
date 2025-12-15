import { api, tryRequest } from "./api.js";

export async function analyzeImage(file) {
  const fd1 = new FormData();
  fd1.append("image", file);

  const fd2 = new FormData();
  fd2.append("file", file);

  return tryRequest([
    () => api.post("/api/analyze", fd1, { headers: { "Content-Type": "multipart/form-data" } }),
    () => api.post("/api/analyze", fd2, { headers: { "Content-Type": "multipart/form-data" } }),
    () => api.post("/api/analysis", fd1, { headers: { "Content-Type": "multipart/form-data" } }),
    () => api.post("/api/analysis", fd2, { headers: { "Content-Type": "multipart/form-data" } })
  ]);
}
