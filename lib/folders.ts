export type Color = string; // tailwind-ish hex or css color

export interface FolderMeta {
  color?: Color;
  tags?: string[];
}

export interface FileMeta {
  color?: Color;
  tags?: string[];
}

export interface FolderIndex {
  // folder path like "work/project" (no leading/trailing slash). Root is "".
  folders?: Record<string, FolderMeta>;
  // file slug like "work/project/note"
  files?: Record<string, FileMeta>;

  // Explicit folder entities (so empty folders can exist).
  // Stored normalized, without leading/trailing slashes. Root can be "".
  folderEntities?: Record<string, { createdAt?: string }>;
}

export function normalizePath(path: string): string {
  return path
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/+/g, '/');
}

export function mergeTags(a: string[] | undefined, b: string[] | undefined): string[] {
  return [...new Set([...(a ?? []), ...(b ?? [])])];
}

export function getFolderChain(slug: string): string[] {
  const normalized = normalizePath(slug);
  const parts = normalized.split('/');
  parts.pop();
  const chain: string[] = [''];
  let cur = '';
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    chain.push(cur);
  }
  return chain;
}

export function ensureFolderEntity(index: FolderIndex, folder: string): FolderIndex {
  const key = normalizePath(folder);
  const next: FolderIndex = {
    ...index,
    folderEntities: { ...(index.folderEntities ?? {}) },
  };
  if (!next.folderEntities![key]) next.folderEntities![key] = { createdAt: new Date().toISOString() };
  return next;
}

export function resolveFileMeta(index: FolderIndex | null | undefined, slug: string): { color?: Color; tags: string[] } {
  if (!index) return { tags: [] };
  const nSlug = normalizePath(slug);
  const tags: string[] = [];
  let color: string | undefined;

  for (const folder of getFolderChain(nSlug)) {
    const fm = index.folders?.[folder];
    if (fm?.tags) tags.push(...fm.tags);
    if (!color && fm?.color) color = fm.color;
  }

  const file = index.files?.[nSlug];
  if (file?.tags) tags.push(...file.tags);
  if (file?.color) color = file.color;

  return { color, tags: [...new Set(tags)] };
}
