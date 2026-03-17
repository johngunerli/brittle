// Blog export helpers for johngunerli.com style posts.js
// Edge-safe: no Node.js fs/path usage.

import { slugify } from './parse';

export interface BlogPost {
  title: string;
  date: string;
  meta: string;
  tags: string[];
  body: string; // HTML string inside a template literal
}

/**
 * Very small markdown -> html conversion suitable for your blog’s posts.js.
 * It intentionally aims for readable HTML, not full markdown compliance.
 */
export function markdownToHtml(md: string): string {
  // Remove frontmatter
  let s = md.replace(/^---\n[\s\S]*?\n---\n?/g, '').trim();

  // Escape backticks to avoid breaking template strings
  s = s.replace(/`/g, '\\`');

  // Split into blocks by blank lines
  const blocks = s.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);

  const htmlBlocks = blocks.map((b) => {
    // Headings
    const hMatch = b.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const text = inlineMarkdown(hMatch[2]);
      return `<h${level}>${text}</h${level}>`;
    }

    // Unordered list
    if (b.split('\n').every((l) => /^-\s+/.test(l) || /^\*\s+/.test(l))) {
      const items = b.split('\n').map((l) => l.replace(/^[-*]\s+/, '').trim()).filter(Boolean);
      return `<ul>${items.map((it) => `<li>${inlineMarkdown(it)}</li>`).join('')}</ul>`;
    }

    // Ordered list
    if (b.split('\n').every((l) => /^\d+\.\s+/.test(l))) {
      const items = b.split('\n').map((l) => l.replace(/^\d+\.\s+/, '').trim()).filter(Boolean);
      return `<ol>${items.map((it) => `<li>${inlineMarkdown(it)}</li>`).join('')}</ol>`;
    }

    // Code fence
    const fence = b.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/);
    if (fence) {
      const code = escapeHtml(fence[1]);
      return `<pre><code>${code}</code></pre>`;
    }

    // Default paragraph (preserve line breaks as spaces)
    const text = inlineMarkdown(b.replace(/\n+/g, ' '));
    return `<p>${text}</p>`;
  });

  return htmlBlocks.join('\n');
}

function inlineMarkdown(s: string): string {
  let out = escapeHtml(s);

  // links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
    const safeUrl = url.replace(/"/g, '&quot;');
    return `<a href=\"${safeUrl}\">${text}</a>`;
  });

  // bold **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // italics *text* or _text_
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/_([^_]+)_/g, '<em>$1</em>');

  // inline code `x`
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);

  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Patch a posts.js file that contains `const posts = { ... };` (as in your example).
 * Preserves surrounding comments/formatting by replacing ONLY the object literal.
 */
export function upsertPostsJs(source: string, slug: string, post: BlogPost): string {
  const key = slugify(slug);

  const start = source.indexOf('const posts');
  if (start < 0) throw new Error('Could not find `const posts` in posts.js');

  const braceStart = source.indexOf('{', start);
  if (braceStart < 0) throw new Error('Could not find `{` after `const posts`');

  const braceEnd = findMatchingBrace(source, braceStart);
  if (braceEnd < 0) throw new Error('Could not find matching `}` for posts object');

  const before = source.slice(0, braceStart);
  const after = source.slice(braceEnd + 1);

  let objText = source.slice(braceStart, braceEnd + 1);

  // Remove existing entry if present (simple tolerant regex)
  const entryRe = new RegExp(`\n\s*['\"]${escapeRegExp(key)}['\"]\s*:\\s*\\{[\\s\\S]*?\\}\s*,?`, 'm');
  objText = objText.replace(entryRe, '\n');

  // Insert new entry before the closing }
  const entry = renderPostEntry(key, post);
  objText = objText.replace(/\n?\}\s*$/, `\n${entry}\n}`);

  return before + objText + after;
}

function renderPostEntry(key: string, post: BlogPost): string {
  const safeTags = post.tags.map((t) => JSON.stringify(t)).join(', ');
  const body = post.body.replace(/\r\n/g, '\n');

  return `  '${key}': {\n` +
    `    title: ${JSON.stringify(post.title)},\n` +
    `    date: ${JSON.stringify(post.date)},\n` +
    `    meta: ${JSON.stringify(post.meta)},\n` +
    `    tags: [${safeTags}],\n` +
    `    body: \`${body}\`\n` +
    `  },`;
}

function findMatchingBrace(s: string, openIndex: number): number {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = openIndex; i < s.length; i++) {
    const c = s[i];
    const next = s[i + 1];

    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') { inBlockComment = false; i++; }
      continue;
    }

    if (!inSingle && !inDouble && !inTemplate) {
      if (c === '/' && next === '/') { inLineComment = true; i++; continue; }
      if (c === '/' && next === '*') { inBlockComment = true; i++; continue; }
    }

    // String/template handling (respect escapes)
    if (c === '\\') { i++; continue; }

    if (!inDouble && !inTemplate && c === "'") { inSingle = !inSingle; continue; }
    if (!inSingle && !inTemplate && c === '"') { inDouble = !inDouble; continue; }
    if (!inSingle && !inDouble && c === '`') { inTemplate = !inTemplate; continue; }

    if (inSingle || inDouble || inTemplate) continue;

    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
