'use client';

import { useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { preprocessWikiLinks } from '@/lib/parse';
import type { NoteMeta } from '@/lib/github';

interface Props {
  slug: string | null;
  content: string;
  loading: boolean;
  saveStatus: 'saved' | 'saving' | 'unsaved';
  notes: NoteMeta[];
  onChange: (value: string) => void;
  onSave: () => void;
  onRename: (to: string) => void;
  onDelete: () => void;
  onNavigate: (slug: string) => void;
}

const statusStyle = {
  saved:   'text-gray-400',
  saving:  'text-gray-400',
  unsaved: 'text-amber-500',
};
const statusText  = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved' };

export default function Editor({
  slug, content, loading, saveStatus, notes,
  onChange, onSave, onRename, onDelete, onNavigate,
}: Props) {
  const [mode, setMode] = useState<'edit' | 'preview'>('preview');
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  // Backlinks — notes whose `links` array includes this slug
  const backlinks = slug
    ? notes.filter((n) => n.slug !== slug && n.links.includes(slug))
    : [];

  // Image paste
  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((i) => i.type.startsWith('image/'));
    if (!imageItem) return;

    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;

    const ext = file.type.split('/')[1] ?? 'png';
    const filename = `img-${Date.now()}.${ext}`;

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64  = dataUrl.split(',')[1];

      const res  = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, base64 }),
      });
      const { path } = await res.json() as { path: string };

      // Insert markdown image at cursor
      const ta    = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end   = ta.selectionEnd;
      const insert = `![](${path})`;
      onChange(content.slice(0, start) + insert + content.slice(end));

      // Re-position cursor after insert
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + insert.length;
        ta.focus();
      });
    };
    reader.readAsDataURL(file);
  }, [content, onChange]);

  if (!slug) {
    return (
      <main className="flex-1 flex items-center justify-center text-gray-400 text-sm select-none">
        Select a note or create a new one
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Loading…
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col min-w-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700 truncate max-w-xs">{slug}</span>
          <span className={`text-xs ${statusStyle[saveStatus]}`}>{statusText[saveStatus]}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded border border-gray-200 overflow-hidden text-xs">
            <button
              onClick={() => setMode('edit')}
              className={`px-3 py-1 transition-colors ${mode === 'edit' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              Edit
            </button>
            <button
              onClick={() => setMode('preview')}
              className={`px-3 py-1 transition-colors ${mode === 'preview' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              Preview
            </button>
          </div>
          <button
            onClick={onSave}
            disabled={saveStatus !== 'unsaved'}
            className="px-3 py-1 text-xs rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default transition-colors"
          >
            Save
          </button>
          <button
            onClick={async () => {
              const blogSlug = prompt('Blog slug (URL: /blog/<slug>)', slug.split('/').pop() ?? slug);
              if (blogSlug === null) return;
              const title = prompt('Blog title', '');
              if (title === null) return;
              const date = prompt('Blog date (e.g. March 2026)', '');
              if (date === null) return;
              const meta = prompt('Meta string (comma-separated)', '');
              if (meta === null) return;
              const tagsRaw = prompt('Tags (comma-separated)', '');
              if (tagsRaw === null) return;
              const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);

              const res = await fetch('/api/export-blog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  noteSlug: slug,
                  blogSlug: blogSlug.trim() || undefined,
                  title: title.trim() || undefined,
                  date: date.trim() || undefined,
                  meta: meta.trim() || undefined,
                  tags: tags.length ? tags : undefined,
                }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                alert(data.error ?? 'Export failed');
                return;
              }
              alert(`Exported to blog as /blog/${data.slug}`);
            }}
            className="px-3 py-1 text-xs rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
            title="Export this note to your blog repo"
          >
            Export
          </button>
          <button
            onClick={() => {
              const next = prompt('Rename / move note to slug (e.g. folder/new-name)', slug);
              if (!next) return;
              onRename(next);
            }}
            className="px-3 py-1 text-xs rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Rename
          </button>
          <button
            onClick={onDelete}
            className="px-2 py-1 text-xs rounded border border-gray-200 text-red-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {mode === 'edit' ? (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => onChange(e.target.value)}
            onPaste={handlePaste}
            spellCheck
            className="flex-1 resize-none p-6 font-mono text-sm leading-relaxed text-gray-800 focus:outline-none"
            placeholder="Start writing… paste images, use [[wiki-links]], #tags"
          />
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl prose-note text-sm leading-relaxed text-gray-800">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => {
                    if (href?.startsWith('#wikilink-')) {
                      const target = href.slice('#wikilink-'.length);
                      const exists = notes.some((n) => n.slug === target);
                      return (
                        <button
                          onClick={() => onNavigate(target)}
                          className={`underline decoration-dotted cursor-pointer ${
                            exists ? 'text-blue-600' : 'text-red-400'
                          }`}
                        >
                          {children}
                        </button>
                      );
                    }
                    return (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                        {children}
                      </a>
                    );
                  },
                  img: ({ src, alt }) => {
                    const proxySrc = typeof src === 'string' && src.startsWith('assets/') ? `/api/assets/${src.slice('assets/'.length)}` : src;
                    return <img src={proxySrc} alt={alt ?? ''} className="max-w-full rounded" />;
                  },
                }}
              >
                {preprocessWikiLinks(content)}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* Backlinks */}
        {backlinks.length > 0 && (
          <div className="flex-shrink-0 border-t border-gray-100 px-6 py-3 bg-gray-50">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
              Backlinks ({backlinks.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {backlinks.map((n) => (
                <button
                  key={n.slug}
                  onClick={() => onNavigate(n.slug)}
                  className="text-xs px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-400 transition-colors"
                >
                  {n.title !== 'Untitled' ? n.title : n.slug}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-5 py-1.5 border-t border-gray-100 flex-shrink-0">
        <span className="text-xs text-gray-300">⌘S to save · paste images · [[wiki-links]] · #tags</span>
      </div>
    </main>
  );
}
