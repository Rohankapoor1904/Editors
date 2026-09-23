import { MediaAsset } from './mediaPool';

/**
 * R24.7 — smart media bins: serializable filter descriptors over assets.
 * Predicates are data (field/op/value), never callbacks, so custom bins
 * persist and resolve identically everywhere. Unknown fields/ops throw
 * instead of silently matching everything.
 */

export type BinField = 'type' | 'rating' | 'offline' | 'scene' | 'tag';
export type BinOp = 'eq' | 'gte' | 'includes' | 'contains';

export interface BinFilter {
  field: BinField;
  op: BinOp;
  value: string | number | boolean;
}

export interface BinDefinition {
  id: string;
  name: string;
  filters: BinFilter[];
  /** AND (default) or OR across filters. */
  mode?: 'and' | 'or';
}

const KNOWN_FIELDS: readonly BinField[] = ['type', 'rating', 'offline', 'scene', 'tag'];
const KNOWN_OPS: readonly BinOp[] = ['eq', 'gte', 'includes', 'contains'];

export function validateBinFilter(filter: BinFilter): void {
  if (!filter || !KNOWN_FIELDS.includes(filter.field)) {
    throw new Error(`mediaBins: unknown bin field '${String((filter as BinFilter)?.field)}'`);
  }
  if (!KNOWN_OPS.includes(filter.op)) {
    throw new Error(`mediaBins: unknown bin op '${String(filter.op)}'`);
  }
  if (filter.op === 'gte' && typeof filter.value !== 'number') {
    throw new Error('mediaBins: gte filters need a numeric value');
  }
  if ((filter.op === 'eq' || filter.op === 'contains' || filter.op === 'includes') &&
      typeof filter.value !== 'string' && typeof filter.value !== 'number' && typeof filter.value !== 'boolean') {
    throw new Error('mediaBins: filter value must be a string, number or boolean');
  }
  if (filter.field === 'rating' && filter.op === 'gte' && ((filter.value as number) < 0 || (filter.value as number) > 5)) {
    throw new Error('mediaBins: rating gte must be within 0..5');
  }
}

export function validateBinDefinition(def: BinDefinition): void {
  if (!def || typeof def.id !== 'string' || def.id.length === 0) {
    throw new Error('mediaBins: bin needs a non-empty id');
  }
  if (typeof def.name !== 'string' || def.name.length === 0) {
    throw new Error('mediaBins: bin needs a non-empty name');
  }
  if (!Array.isArray(def.filters)) {
    throw new Error('mediaBins: bin filters must be an array (empty matches all)');
  }
  for (const f of def.filters) validateBinFilter(f);
  if (def.mode !== undefined && def.mode !== 'and' && def.mode !== 'or') {
    throw new Error("mediaBins: mode must be 'and' or 'or'");
  }
}

function assetField(asset: MediaAsset, field: BinField): string | number | boolean | string[] | undefined {
  switch (field) {
    case 'type': return asset.type;
    case 'rating': return asset.rating ?? 0;
    case 'offline': return asset.isOffline;
    case 'scene': return asset.scene ?? '';
    case 'tag': return asset.tags ?? [];
  }
}

function matchesOne(asset: MediaAsset, filter: BinFilter): boolean {
  const actual = assetField(asset, filter.field);
  const expected = filter.value;
  switch (filter.op) {
    case 'eq': return actual === expected;
    case 'gte': return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'contains':
      return typeof actual === 'string' && typeof expected === 'string' &&
        actual.toLowerCase().includes(expected.toLowerCase());
    case 'includes':
      return Array.isArray(actual) && actual.includes(expected as string);
  }
}

/** R24.7 — resolves a bin definition against an asset list. */
export function resolveBin(assets: MediaAsset[], def: BinDefinition): MediaAsset[] {
  validateBinDefinition(def);
  if (!Array.isArray(assets)) throw new Error('mediaBins: assets must be an array');
  if (def.filters.length === 0) return [...assets];
  const mode = def.mode ?? 'and';
  return assets.filter((asset) =>
    mode === 'and'
      ? def.filters.every((f) => matchesOne(asset, f))
      : def.filters.some((f) => matchesOne(asset, f))
  );
}

/** R24.7 — built-in smart bins (always present, never persisted). Single
 * taxonomy for the bin: type filters live here, not in a second pill row. */
export const BUILTIN_BINS: BinDefinition[] = [
  { id: 'bin-all', name: 'All Media', filters: [] },
  { id: 'bin-video', name: 'Video', filters: [{ field: 'type', op: 'eq', value: 'video' }] },
  { id: 'bin-audio', name: 'Audio', filters: [{ field: 'type', op: 'eq', value: 'audio' }] },
  { id: 'bin-ai', name: 'AI Generated', filters: [{ field: 'type', op: 'eq', value: 'ai' }] },
  { id: 'bin-offline', name: 'Offline', filters: [{ field: 'offline', op: 'eq', value: true }] },
  { id: 'bin-favorites', name: 'Favorites', filters: [{ field: 'rating', op: 'gte', value: 4 }] },
];
