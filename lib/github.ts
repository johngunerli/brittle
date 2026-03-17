// All GitHub API calls — server-side only (edge-compatible, no Node.js built-ins).

import { parseTitle, parseTags, parseLinks } from './parse';
import type { FolderIndex } from './folders';
import { normalizePath, resolveFileMeta } from './folders';

const GITHUB_API = 'https://api.github.com';
const INDEX_PATH = 'notes/_index.json';
const FOLDERS_PATH = 'notes/_folders.json';

function h() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_PAT}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'brittle-notes',
  };
}
function owner() { return process.env.GITHUB_OWNER!; }
function repo()  { return process.env.GITHUB_REPO!;  }

function encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return btoa(Array.from(bytes, (b) => String.fromCodePoint(b)).join(''));
}
function decode(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.codePointAt(0)!));
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NoteMeta {
  slug: string;
  sha: string;
  title: string;
  tags: string[];
  links: string[];

  // UI-only metadata (folder/file labels). Not persisted in notes/_index.json.
  color?: string;
  folderTags?: string[];
}

export interface Note extends NoteMeta {
  content: string;
}

export interface NoteIndexEntry {
  sha: string;
  title: string;
  tags: string[];
  links: string[];
}

export type NoteIndex = Record<string, NoteIndexEntry>;

export interface SearchResult {
  slug: string;
  excerpt: string;
}

// ─── Index ────────────────────────────────────────────────────────────────────

async function fetchIndex(): Promise<{ data: NoteIndex; sha: string | undefined }> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner()}/${repo()}/contents/${INDEX_PATH}`,
    { headers: h() }
  );
  if (res.status === 404) return { data: {}, sha: undefined };
  if (!res.ok) throw new Error(`Index fetch failed: ${res.status}`);
  const file = await res.json() as { content: string; sha: string };
  try {
    return { data: JSON.parse(decode(file.content)), sha: file.sha };
  } catch {
    return { data: {}, sha: file.sha };
  }
}

async function saveIndex(data: NoteIndex, sha: string | undefined): Promise<void> {
  await fetch(`${GITHUB_API}/repos/${owner()}/${repo()}/contents/${INDEX_PATH}`, {
    method: 'PUT',
    headers: h(),
    body: JSON.stringify({
      message: 'chore: update notes index',
      content: encode(JSON.stringify(data, null, 2)),
      ...(sha ? { sha } : {}),
    }),
  });
}

// ─── Folder/File Metadata ───────────────────────────────────────────────────

async function fetchFolderIndex(): Promise<{ data: FolderIndex; sha: string | undefined }> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner()}/${repo()}/contents/${FOLDERS_PATH}`,
    { headers: h() }
  );
  if (res.status === 404) return { data: {}, sha: undefined };
  if (!res.ok) throw new Error(`Folder index fetch failed: ${res.status}`);
  const file = await res.json() as { content: string; sha: string };
  try {
    return { data: JSON.parse(decode(file.content)), sha: file.sha };
  } catch {
    return { data: {}, sha: file.sha };
  }
}

async function saveFolderIndex(data: FolderIndex, sha: string | undefined): Promise<void> {
  await fetch(`${GITHUB_API}/repos/${owner()}/${repo()}/contents/${FOLDERS_PATH}`, {
    method: 'PUT',
    headers: h(),
    body: JSON.stringify({
      message: 'chore: update folder metadata',
      content: encode(JSON.stringify(data, null, 2)),
      ...(sha ? { sha } : {}),
    }),
  });
}

export async function getFolderMetadata(): Promise<{ index: FolderIndex; sha?: string }> {
  const { data, sha } = await fetchFolderIndex();
  return { index: data, sha };
}

export async function updateFolderMetadata(index: FolderIndex, sha?: string): Promise<{ sha: string }> {
  await saveFolderIndex(index, sha);
  // Re-fetch to return the new sha (GitHub doesn't return sha on PUT in a stable shape)
  const latest = await fetchFolderIndex();
  return { sha: latest.sha ?? '' };
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export async function listNotes(): Promise<NoteMeta[]> {
  // Get file tree (one call, recursive)
  const treeRes = await fetch(
    `${GITHUB_API}/repos/${owner()}/${repo()}/git/trees/HEAD?recursive=1`,
    { headers: h() }
  );
  if (treeRes.status === 404 || treeRes.status === 409) return [];
  if (!treeRes.ok) throw new Error(`Tree fetch failed: ${treeRes.status}`);

  const tree = await treeRes.json() as {
    tree: Array<{ path: string; sha: string; type: string }>;
  };

  const files = tree.tree.filter(
    (f) =>
      f.type === 'blob' &&
      f.path.startsWith('notes/') &&
      f.path.endsWith('.md') &&
      !f.path.includes('_index')
  );

  // Enrich with index metadata
  const { data: index } = await fetchIndex();

  // Merge in folder/file metadata (color/tags)
  const { data: folderIndex } = await fetchFolderIndex();

  return files.map((f) => {
    const slug = f.path.replace(/^notes\//, '').replace(/\.md$/, '');
    const meta = index[slug];
    const resolved = resolveFileMeta(folderIndex, slug);
    return {
      slug,
      sha: f.sha,
      title: meta?.title ?? slug,
      tags: meta?.tags ?? [],
      links: meta?.links ?? [],
      color: resolved.color,
      folderTags: resolved.tags,
    };
  });
}

export async function getNote(slug: string): Promise<Note> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner()}/${repo()}/contents/notes/${slug}.md`,
    { headers: h() }
  );
  if (!res.ok) throw new Error(`Note not found: ${slug}`);
  const file = await res.json() as { content: string; sha: string };
  const content = decode(file.content);
  return {
    slug,
    sha: file.sha,
    content,
    title: parseTitle(content),
    tags: parseTags(content),
    links: parseLinks(content),
  };
}

export async function saveNote(
  slug: string,
  content: string,
  sha?: string
): Promise<{ sha: string }> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner()}/${repo()}/contents/notes/${slug}.md`,
    {
      method: 'PUT',
      headers: h(),
      body: JSON.stringify({
        message: sha ? `update: ${slug}` : `create: ${slug}`,
        content: encode(content),
        ...(sha ? { sha } : {}),
      }),
    }
  );
  if (!res.ok) throw new Error(`Failed to save note: ${await res.text()}`);
  const data = await res.json() as { content: { sha: string } };
  const newSha = data.content.sha;

  // Update index
  const { data: index, sha: indexSha } = await fetchIndex();
  index[slug] = {
    sha: newSha,
    title: parseTitle(content),
    tags: parseTags(content),
    links: parseLinks(content),
  };
  await saveIndex(index, indexSha);

  return { sha: newSha };
}

export async function deleteNote(slug: string, sha: string): Promise<void> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner()}/${repo()}/contents/notes/${slug}.md`,
    {
      method: 'DELETE',
      headers: h(),
      body: JSON.stringify({ message: `delete: ${slug}`, sha }),
    }
  );
  if (!res.ok) throw new Error(`Failed to delete note: ${res.status}`);

  // Remove from index
  const { data: index, sha: indexSha } = await fetchIndex();
  delete index[slug];
  await saveIndex(index, indexSha);
}

/**
 * Rename / move a note across folders by creating the new path then deleting the old.
 *
 * Notes are stored as markdown files under `notes/<slug>.md`.
 *
 * - If `to` already exists, the GitHub API will reject the create.
 * - If `sha` is provided, it is used for the delete call; otherwise we fetch the note.
 */
export async function moveNote(
  from: string,
  to: string,
  sha?: string
): Promise<{ sha: string }> {
  const normFrom = normalizePath(from);
  const normTo = normalizePath(to);

  // Fetch content (and sha if not supplied)
  const existing = await getNote(normFrom);
  const fromSha = sha ?? existing.sha;

  // Create new note first (so failure doesn't delete the old)
  const createRes = await fetch(
    `${GITHUB_API}/repos/${owner()}/${repo()}/contents/notes/${normTo}.md`,
    {
      method: 'PUT',
      headers: h(),
      body: JSON.stringify({
        message: `move: ${normFrom} -> ${normTo}`,
        content: encode(existing.content),
      }),
    }
  );
  if (!createRes.ok) throw new Error(`Failed to create destination note: ${await createRes.text()}`);
  const createData = await createRes.json() as { content: { sha: string } };
  const newSha = createData.content.sha;

  // Delete old note
  await deleteNote(normFrom, fromSha);

  // Ensure destination index entry reflects the new slug + sha
  const { data: index, sha: indexSha } = await fetchIndex();
  index[normTo] = {
    sha: newSha,
    title: parseTitle(existing.content),
    tags: parseTags(existing.content),
    links: parseLinks(existing.content),
  };
  await saveIndex(index, indexSha);

  // Move file-level metadata if present
  const { data: folderIndex, sha: folderSha } = await fetchFolderIndex();
  const filesMeta = folderIndex.files ?? {};
  if (filesMeta[normFrom]) {
    filesMeta[normTo] = filesMeta[normFrom];
    delete filesMeta[normFrom];
    folderIndex.files = filesMeta;
    await saveFolderIndex(folderIndex, folderSha);
  }

  return { sha: newSha };
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchNotes(query: string): Promise<SearchResult[]> {
  const q = encodeURIComponent(`${query} repo:${owner()}/${repo()} path:notes`);
  const res = await fetch(`${GITHUB_API}/search/code?q=${q}&per_page=20`, {
    headers: {
      ...h(),
      Accept: 'application/vnd.github.text-match+json',
    },
    
  });
  if (!res.ok) return [];

  const data = await res.json() as {
    items: Array<{
      path: string;
      text_matches?: Array<{ fragment: string }>;
    }>;
  };

  return data.items.map((item) => ({
    slug: item.path.replace(/^notes\//, '').replace(/\.md$/, ''),
    excerpt: item.text_matches?.[0]?.fragment ?? '',
  }));
}

// ─── Assets ───────────────────────────────────────────────────────────────────

export async function uploadAsset(
  filename: string,
  base64Data: string
): Promise<{ path: string }> {
  const path = `notes/assets/${filename}`;
  // Check if file already exists (to get its sha)
  let existingSha: string | undefined;
  const check = await fetch(`${GITHUB_API}/repos/${owner()}/${repo()}/contents/${path}`, {
    headers: h(),
    
  });
  if (check.ok) {
    const existing = await check.json() as { sha: string };
    existingSha = existing.sha;
  }

  await fetch(`${GITHUB_API}/repos/${owner()}/${repo()}/contents/${path}`, {
    method: 'PUT',
    headers: h(),
    body: JSON.stringify({
      message: `upload asset: ${filename}`,
      content: base64Data,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });

  return { path: `assets/${filename}` };
}

export async function getAsset(assetPath: string): Promise<{ data: Uint8Array; contentType: string }> {
  const fullPath = `notes/${assetPath}`;
  const res = await fetch(
    `${GITHUB_API}/repos/${owner()}/${repo()}/contents/${fullPath}`,
    { headers: h() }
  );
  if (!res.ok) throw new Error(`Asset not found: ${assetPath}`);
  const file = await res.json() as { content: string; encoding: string };
  const bin = atob(file.content.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.codePointAt(0)!);

  const ext = assetPath.split('.').pop()?.toLowerCase() ?? '';
  const contentTypes: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    pdf: 'application/pdf',
  };
  return { data: bytes, contentType: contentTypes[ext] ?? 'application/octet-stream' };
}
