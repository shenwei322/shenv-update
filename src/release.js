const VERSION_PATTERN = /^\d+(\.\d+){0,3}(-[0-9A-Za-z.-]+)?$/;

export function normalizeVersion(value) {
  return String(value ?? "")
    .trim()
    .replace(/^v/i, "");
}

export function isValidVersion(value) {
  return VERSION_PATTERN.test(normalizeVersion(value));
}

export function compareVersions(left, right) {
  const a = normalizeVersion(left).split(".");
  const b = normalizeVersion(right).split(".");
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const x = Number.parseInt(a[index] ?? "0", 10) || 0;
    const y = Number.parseInt(b[index] ?? "0", 10) || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

export function isNewer(candidate, current) {
  return compareVersions(candidate, current) > 0;
}

export function safePattern(pattern) {
  if (typeof pattern !== "string" || !pattern.trim()) return null;
  let source = pattern.trim();
  let flags = "";
  // GitHub 资产名大小写混杂，默认配置用 (?i) 前缀；JS 正则不认内联 flag，这里转成构造参数。
  const inline = /^\(\?([ims]+)\)/.exec(source);
  if (inline) {
    flags = inline[1];
    source = source.slice(inline[0].length);
  }
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

function guessPackageType(assetName) {
  const name = String(assetName || "").toLowerCase();
  if (/(setup|installer)[^/]*\.exe$|\.msi$|\.msix$/.test(name)) return "installer";
  return "portable";
}

export function firstImageUrl(notes, assets = []) {
  const text = String(notes || "");
  for (const pattern of [
    /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i,
    /<img[^>]+src=["'](https?:\/\/[^"']+)["']/i,
  ]) {
    const match = pattern.exec(text);
    if (match) return match[1];
  }
  const image = assets.find((asset) => /\.(png|jpe?g|webp|gif)$/i.test(String(asset.name || "")));
  return image?.browser_download_url || "";
}

export function pickAsset(assets, pattern) {
  const list = Array.isArray(assets) ? assets.filter((asset) => asset && asset.name) : [];
  if (!list.length) return null;
  const regex = safePattern(pattern);
  const matched = regex ? list.filter((asset) => regex.test(asset.name)) : [];
  const candidates = matched.length ? matched : list.filter((asset) => /\.(exe|msi|zip)$/i.test(asset.name));
  const pool = candidates.length ? candidates : list;
  return (
    pool.find((asset) => /\.exe$/i.test(asset.name)) ||
    pool.find((asset) => /\.msi$/i.test(asset.name)) ||
    pool[0]
  );
}

export function mapGithubRelease(release, { pattern, previous } = {}) {
  const tag = normalizeVersion(release?.tag_name || release?.name || "");
  const asset = pickAsset(release?.assets, pattern);
  const now = Date.now();
  return {
    version: tag,
    title: release?.name || `Turf Launcher ${tag}`,
    notes: release?.body || "",
    force: Boolean(previous?.force),
    channel: previous?.channel || "stable",
    packageType: guessPackageType(asset?.name),
    downloadUrl: asset?.browser_download_url || "",
    sha256: String(asset?.digest || "")
      .replace(/^sha256:/i, "")
      .trim(),
    size: Number(asset?.size) || 0,
    releaseUrl: release?.html_url || "",
    minSupported: previous?.minSupported || "0.0.0",
    publishedAt: Date.parse(release?.published_at || "") || now,
    updatedAt: now,
    source: "github",
    mirrors: [],
    coverImage: firstImageUrl(release?.body, release?.assets),
    assetName: asset?.name || "",
  };
}

export function publicMirrors(state, scope = "update") {
  const list = Array.isArray(state.mirrors) ? state.mirrors : [];
  return list
    .filter((mirror) => mirror && mirror.enabled && (!scope || mirror.scope === scope))
    .sort((left, right) => (Number(left.sortOrder) || 0) - (Number(right.sortOrder) || 0))
    .filter((mirror) => /^https?:\/\//i.test(String(mirror.url || "")))
    .map((mirror) => ({
      name: String(mirror.name || "镜像节点"),
      url: String(mirror.url),
    }));
}

export function mergeUpdateMirrors(state, release) {
  const seen = new Set();
  const out = [];
  const push = (item) => {
    const url = String(item?.url || "").trim();
    if (!/^https?:\/\//i.test(url) || seen.has(url)) return;
    seen.add(url);
    out.push({ name: String(item?.name || "下载节点").slice(0, 80), url });
  };
  for (const item of Array.isArray(release?.mirrors) ? release.mirrors : []) push(item);
  for (const item of publicMirrors(state, "update")) push(item);
  return out.slice(0, 8);
}

export function buildPublicUpdate(state, query = {}) {
  const release = state.release;
  if (!release || !normalizeVersion(release.version)) return null;
  const current = normalizeVersion(query.current || "0.0.0") || "0.0.0";
  const minSupported = normalizeVersion(release.minSupported || "0.0.0");
  const force = Boolean(release.force) || (minSupported !== "0.0.0" && isNewer(minSupported, current));

  return {
    hasUpdate: isNewer(release.version, current),
    current,
    version: normalizeVersion(release.version),
    title: release.title || `Turf Launcher ${normalizeVersion(release.version)}`,
    notes: release.notes || "",
    force,
    channel: release.channel || "stable",
    publishedAt: Number(release.publishedAt) || Number(release.updatedAt) || 0,
    releaseUrl: release.releaseUrl || "",
    minSupported,
    packageType: release.packageType === "installer" ? "installer" : "portable",
    coverImage: /^https?:\/\//i.test(String(release.coverImage || "")) ? release.coverImage : "",
    download: {
      url: release.downloadUrl || "",
      sha256: String(release.sha256 || "").toLowerCase(),
      size: Number(release.size) || 0,
      mirrors: mergeUpdateMirrors(state, release),
    },
  };
}

export function toLegacyUpdate(payload) {
  if (!payload) return null;
  return {
    ...payload,
    mandatory: payload.force,
    downloadUrl: payload.download?.url || "",
    notes: payload.notes || "",
  };
}
