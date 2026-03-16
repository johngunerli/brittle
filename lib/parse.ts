// Pure parsing utilities — safe to import in both server (edge) and client code.

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s/-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseTitle(content: string): string {
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
  return body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? 'Untitled';
}

export function parseTags(content: string): string[] {
  const tags = new Set<string>();

  // YAML frontmatter: tags: tag1, tag2  OR  tags: [tag1, tag2]
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const line = fm[1].match(/^tags:\s*(.+)$/m);
    if (line) {
      line[1]
        .replace(/[\[\]]/g, '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .forEach((t) => tags.add(t));
    }
  }

  // Inline #tags — must NOT be at start of line (those are headings)
  for (const m of content.matchAll(/(?:[^#\n])#([a-zA-Z]\w*)/g)) {
    tags.add(m[1]);
  }

  return [...tags];
}

export function parseLinks(content: string): string[] {
  const seen = new Set<string>();
  for (const m of content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
    seen.add(slugify(m[1].trim()));
  }
  return [...seen];
}

/** Replace [[links]] with markdown links that ReactMarkdown can intercept. */
export function preprocessWikiLinks(content: string): string {
  return content.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, target, alias) => {
    const slug = slugify(target.trim());
    const label = alias?.trim() || target.trim();
    return `[${label}](#wikilink-${slug})`;
  });
}
