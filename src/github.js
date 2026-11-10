const API_ROOT = "https://api.github.com";
const USER_AGENT = "shenv-update/1.0";

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function isValidRepo(repo) {
  return typeof repo === "string" && REPO_PATTERN.test(repo.trim());
}

export async function githubRequest(pathname, { token = "", method = "GET", body } = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${API_ROOT}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 404) {
    return { notFound: true, status: 404, data: null };
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      (data && (data.message || data.error)) || text.slice(0, 200) || `HTTP ${response.status}`;
    const error = new Error(`GitHub API ${response.status}：${message}`);
    error.status = response.status;
    throw error;
  }

  return { notFound: false, status: response.status, data };
}

export async function getLatestRelease(repo, token) {
  if (!isValidRepo(repo)) throw new Error("GitHub 仓库格式应为 owner/repo");
  const result = await githubRequest(`/repos/${repo.trim()}/releases/latest`, { token });
  if (result.notFound) return null;
  return result.data;
}

export async function getReleaseByTag(repo, tag, token) {
  if (!isValidRepo(repo)) throw new Error("GitHub 仓库格式应为 owner/repo");
  const result = await githubRequest(
    `/repos/${repo.trim()}/releases/tags/${encodeURIComponent(tag)}`,
    { token }
  );
  if (result.notFound) return null;
  return result.data;
}

export async function listReleases(repo, token, limit = 20) {
  if (!isValidRepo(repo)) throw new Error("GitHub 仓库格式应为 owner/repo");
  const size = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const result = await githubRequest(`/repos/${repo.trim()}/releases?per_page=${size}`, { token });
  return Array.isArray(result.data) ? result.data : [];
}

export async function getRepoFile(repo, filePath, branch, token) {
  const encoded = filePath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const result = await githubRequest(
    `/repos/${repo.trim()}/contents/${encoded}?ref=${encodeURIComponent(branch)}`,
    { token }
  );
  if (result.notFound) return null;
  return result.data;
}

export async function putRepoFile(repo, filePath, branch, token, { content, sha, message }) {
  const encoded = filePath
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const result = await githubRequest(`/repos/${repo.trim()}/contents/${encoded}`, {
    token,
    method: "PUT",
    body: {
      message: message || "chore(state): update shenv release state",
      content: Buffer.from(content, "utf8").toString("base64"),
      branch,
      ...(sha ? { sha } : {}),
    },
  });
  return result.data;
}
