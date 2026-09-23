/**
 * R26.4 — proxy preset catalogue (mirrors Rust proxy_presets()).
 *
 * The TS catalogue is the source of truth for the UI; Rust validates on
 * task creation, so a mismatch surfaces as a typed error rather than a
 * silent fallback. Presets are resolution+codec pairs the UI offers.
 */

export interface ProxyPreset {
  id: string;
  name: string;
  targetHeight: number;
  codec: 'h264' | 'prores';
  description: string;
}

export const PROXY_PRESETS: ProxyPreset[] = [
  {
    id: 'proxy-720p-h264',
    name: '720p H.264',
    targetHeight: 720,
    codec: 'h264',
    description: 'Default: small files, universal playback',
  },
  {
    id: 'proxy-540p-h264',
    name: '540p H.264',
    targetHeight: 540,
    codec: 'h264',
    description: 'Lighter previews for long timelines',
  },
  {
    id: 'proxy-360p-h264',
    name: '360p H.264',
    targetHeight: 360,
    codec: 'h264',
    description: 'Minimal preview size, fastest scrub',
  },
  {
    id: 'proxy-720p-prores',
    name: '720p ProRes Proxy',
    targetHeight: 720,
    codec: 'prores',
    description: 'Edit-friendly intra-frame proxy (larger files)',
  },
];

export function getProxyPreset(id: string): ProxyPreset {
  const found = PROXY_PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`proxyPresets: unknown preset '${id}'`);
  return found;
}

export function validateProxyPreset(preset: ProxyPreset): void {
  if (!preset || typeof preset.id !== 'string' || preset.id.length === 0) {
    throw new Error('proxyPresets: preset needs a non-empty id');
  }
  if (preset.codec !== 'h264' && preset.codec !== 'prores') {
    throw new Error(`proxyPresets: unsupported codec '${String(preset.codec)}'`);
  }
  if (!Number.isInteger(preset.targetHeight) || preset.targetHeight <= 0) {
    throw new Error('proxyPresets: targetHeight must be a positive integer');
  }
}

export function proxyExtension(codec: string): string {
  return codec.toLowerCase() === 'prores' ? 'mov' : 'mp4';
}

/** Width threshold above which import auto-starts a proxy job (UHD+). */
export const AUTO_PROXY_MIN_WIDTH = 3840;

export function shouldAutoProxy(width?: number): boolean {
  return typeof width === 'number' && Number.isFinite(width) && width >= AUTO_PROXY_MIN_WIDTH;
}

export function defaultProxyPath(inputPath: string, codec: string): string {
  if (!inputPath) throw new Error('proxyPresets: inputPath is required');
  const normalized = inputPath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  const dir = lastSlash >= 0 ? normalized.slice(0, lastSlash) : '.';
  const file = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const dot = file.lastIndexOf('.');
  const stem = dot >= 0 ? file.slice(0, dot) : file;
  return `${dir}/${stem}.proxy.${proxyExtension(codec)}`;
}
