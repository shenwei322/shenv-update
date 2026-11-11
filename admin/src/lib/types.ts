export type PageId = 'overview' | 'release' | 'announcements' | 'mirrors' | 'settings'

export type Channel = 'stable' | 'beta'
export type PackageType = 'portable' | 'installer'
export type ReleaseSource = 'manual' | 'github'
export type AnnouncementLevel = 'info' | 'warning' | 'important'
export type MirrorRegion = 'global' | 'cn' | 'auto'
export type MirrorScope = 'update' | 'game'

export interface Captcha {
  id: string
  svg: string
  expiresIn: number
}

export interface LoginInput {
  username: string
  password: string
  captchaId: string
  captchaAnswer: string
}

export interface LoginResponse {
  token: string
  expiresAt: number
  username: string
}

export interface Session {
  username: string
  expiresAt: number
}

export interface PasswordInput {
  current: string
  next: string
}

export interface Release {
  version: string
  title: string
  notes: string
  force: boolean
  channel: Channel
  packageType: PackageType
  downloadUrl: string
  sha256: string
  size: number
  releaseUrl: string
  minSupported: string
  publishedAt: number
  updatedAt: number
  source: ReleaseSource
  coverImage?: string
}

export interface ReleaseInput {
  version: string
  title: string
  notes: string
  force: boolean
  channel: Channel
  packageType: PackageType
  downloadUrl: string
  sha256: string
  size: number
  releaseUrl: string
  minSupported: string
  publishedAt?: number
  source?: ReleaseSource
  coverImage?: string
}

export interface StatPoint {
  day: string
  checks: number
  launches: number
}

export interface OverviewStats {
  updateChecks: number
  launches: number
  lastUpdateCheckAt: number
  lastLaunchAt: number
  series: StatPoint[]
}

export interface OverviewCounts {
  announcements: number
  mirrors: number
  audits: number
}

export interface GithubState {
  repo: string
  autoSync: boolean
  lastAt: number
  lastTag: string
  lastError: string
}

export interface Overview {
  stats: OverviewStats
  counts: OverviewCounts
  release: Release
  github: GithubState
  serverTime: number
}

export interface GithubAsset {
  name: string
  size: number
  url: string
}

export interface GithubSyncInput {
  tag?: string
  pattern?: string
}

export interface GithubSyncResult {
  release: Release
  asset: GithubAsset | null
  matched: boolean
  message: string
}

export interface GithubReleaseItem {
  tag: string
  name: string
  publishedAt: number
  prerelease: boolean
  draft?: boolean
  assets: GithubAsset[]
}

export interface Announcement {
  id: number
  title: string
  content: string
  pinned: boolean
  level: AnnouncementLevel
  enabled: boolean
  createdAt: number
  expiresAt: number
}

export interface AnnouncementInput {
  title: string
  content: string
  pinned: boolean
  level: AnnouncementLevel
  enabled: boolean
  expiresAt: number
}

export interface Mirror {
  id: number
  name: string
  url: string
  scope?: MirrorScope
  region: MirrorRegion
  enabled: boolean
  sortOrder: number
  createdAt: number
}

export interface MirrorInput {
  name: string
  url: string
  scope: MirrorScope
  region: MirrorRegion
  enabled: boolean
  sortOrder: number
}

export interface GithubSettings {
  repo: string
  hasToken: boolean
  assetPattern: string
  autoSync: boolean
}

export interface Settings {
  siteName: string
  channel: Channel
  apiBase: string
  github: GithubSettings
  cronSecret: string
}

export interface SettingsInput {
  siteName: string
  channel: Channel
  apiBase: string
  github: {
    repo: string
    token: string
    assetPattern: string
    autoSync: boolean
  }
}
