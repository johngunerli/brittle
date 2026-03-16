// All GitHub API calls — server-side only (edge-compatible, no Node.js built-ins).

import { parseTitle, parseTags, parseLinks } from './parse';

const GITHUB_API = 'https://api.github.com';
const INDEX_PATH = 'notes/_index.json';

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

  return files.map((f) => {
    const slug = f.path.replace(/^notes\//, '').replace(/\.md$/, '');
    const meta = index[slug];
    return {
      slug,
      sha: f.sha,
      title: meta?.title ?? slug,
      tags: meta?.tags ?? [],
      links: meta?.links ?? [],
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
