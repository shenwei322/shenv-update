/// 把 Vercel 的 catch-all 路由还原成 Express 需要的原始 URL。
export function originalApiUrl(query = {}) {
  const rawPath = query.path;
  const segments = Array.isArray(rawPath)
    ? rawPath
    : typeof rawPath === "string" && rawPath.trim()
      ? rawPath.split("/")
      : [];

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === "path") continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
    } else if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  }

  const path = segments
    .filter((segment) => segment !== "")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const search = params.toString();
  return `/api${path ? `/${path}` : ""}${search ? `?${search}` : ""}`;
}

export function setExpressUrl(req) {
  const current = typeof req.url === "string" ? req.url : "";
  const hasPath = Array.isArray(req.query?.path)
    ? req.query.path.length > 0
    : Boolean(req.query?.path);

  // Vercel 有时保留原始 URL，有时会重写成 /api；只在路径丢失时重建。
  if (current.startsWith("/api/") && current !== "/api") return;
  if (hasPath) req.url = originalApiUrl(req.query || {});
}
