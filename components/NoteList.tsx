'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { NoteMeta } from '@/lib/github';
import Uploader, { type ConvertedDoc } from './Uploader';
import type { FolderIndex } from '@/lib/folders';
import { normalizePath, resolveFileMeta } from '@/lib/folders';

interface Props {
  notes: NoteMeta[];
  selectedSlug: string | null;
  activeTag: string | null;
  onSelect: (slug: string) => void;
  onNew: (title: string) => void;
  onUpload: (doc: ConvertedDoc) => void;
  onTagClick: (tag: string | null) => void;
  onGraphOpen: () => void;
  onMoved?: (from: string, to: string) => void;

  folderIndex: FolderIndex;
  onFolderColor: (folder: string, color?: string) => void;
  onFolderTags: (folder: string, tags: string[]) => void;
  onFileColor: (slug: string, color?: string) => void;
  onFileTags: (slug: string, tags: string[]) => void;

  onCreateFolder?: (folder: string) => void;
}

export default function NoteList({
  notes, selectedSlug, activeTag,
  onSelect, onNew, onUpload, onTagClick, onGraphOpen, onMoved,
  folderIndex, onFolderColor, onFolderTags, onFileColor, onFileTags,
  onCreateFolder,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle]       = useState('');
  const [search, setSearch]     = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ slug: string; excerpt: string }> | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState<number>(240);
  const resizingRef = useRef(false);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('brittle.sidebarWidth') : null;
    if (saved) {
      const n = Number(saved);
      if (Number.isFinite(n)) setSidebarWidth(Math.min(520, Math.max(200, n)));
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const next = Math.min(520, Math.max(200, e.clientX));
      setSidebarWidth(next);
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      window.localStorage.setItem('brittle.sidebarWidth', String(sidebarWidth));
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [sidebarWidth]);

  // All unique tags across loaded notes
  const allTags = [...new Set(notes.flatMap((n) => n.tags))].sort();

  // Filtered notes (by tag)
  const filteredNotes = activeTag
    ? notes.filter((n) => n.tags.includes(activeTag))
    : notes;

  // Group by folder
  const grouped = new Map<string, NoteMeta[]>();
  for (const note of filteredNotes) {
    const slash = note.slug.lastIndexOf('/');
    const folder = slash >= 0 ? note.slug.slice(0, slash) : '';
    if (!grouped.has(folder)) grouped.set(folder, []);
    grouped.get(folder)!.push(note);
  }

  // Ensure explicit/empty folders are present
  for (const folder of Object.keys(folderIndex.folderEntities ?? {})) {
    if (!grouped.has(folder)) grouped.set(folder, []);
  }
  const sortedFolders = [...grouped.keys()].sort((a, b) => {
    if (a === '') return -1;
    if (b === '') return 1;
    return a.localeCompare(b);
  });

  const COLOR_OPTIONS: Array<{ label: string; value: string }> = [
    { label: 'Blue', value: '#60a5fa' },
    { label: 'Green', value: '#34d399' },
    { label: 'Yellow', value: '#fbbf24' },
    { label: 'Orange', value: '#fb923c' },
    { label: 'Red', value: '#f87171' },
    { label: 'Purple', value: '#a78bfa' },
    { label: 'Slate', value: '#94a3b8' },
  ];

  const editFolderTags = (folder: string) => {
    const key = normalizePath(folder);
    const current = folderIndex.folders?.[key];
    const tags = prompt('Folder tags (comma-separated). Leave blank to clear.', (current?.tags ?? []).join(', '));
    if (tags !== null) {
      const parsed = tags.split(',').map((t) => t.trim()).filter(Boolean);
      onFolderTags(key, parsed);
    }
  };

  const editFileTags = (slug: string) => {
    const key = normalizePath(slug);
    const current = folderIndex.files?.[key];
    const tags = prompt('File tags (comma-separated). Leave blank to clear.', (current?.tags ?? []).join(', '));
    if (tags !== null) {
      const parsed = tags.split(',').map((t) => t.trim()).filter(Boolean);
      onFileTags(key, parsed);
    }
  };

  const dragSlugRef = useRef<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const moveNoteToFolder = useCallback(async (fromSlug: string, folder: string) => {
    const from = normalizePath(fromSlug);
    const toFolder = normalizePath(folder);
    const base = from.includes('/') ? from.split('/').pop()! : from;
    const to = toFolder ? `${toFolder}/${base}` : base;
    if (to === from) return;

    const res = await fetch('/api/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? 'Move failed');
      return;
    }

    if (selectedSlug === from) onSelect(to);
    onMoved?.(from, to);
  }, [onSelect, selectedSlug]);

  // Debounced GitHub search
  useEffect(() => {
    if (!search.trim()) { setSearchResults(null); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(search)}`);
        setSearchResults(await res.json());
      } finally {
        setSearching(false);
      }
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    onNew(t);
    setTitle('');
    setCreating(false);
  };

  return (
    <aside
      className="flex-shrink-0 flex flex-col border-r border-gray-200 bg-gray-50 relative"
      style={{ width: sidebarWidth }}
    >
      {/* Drag handle */}
      <div
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-gray-200/70 active:bg-gray-300/70"
        onMouseDown={() => {
          resizingRef.current = true;
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';
        }}
        title="Drag to resize"
      />
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-700 tracking-wide">brittle</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onGraphOpen}
            title="Graph view"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors text-xs"
          >
            ⬡
          </button>
          <Uploader onConverted={onUpload} />

          <button
            onClick={() => {
              const folder = prompt('New folder path (e.g. work/projects)');
              if (!folder) return;
              onCreateFolder?.(folder);
            }}
            title="New folder"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors text-xs"
          >
            📁
          </button>

          <button
            onClick={() => setCreating(true)}
            title="New note"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors text-lg leading-none"
          >
            +
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-gray-200">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes…"
          className="w-full text-xs px-2.5 py-1.5 rounded border border-gray-200 focus:outline-none focus:border-gray-400 bg-white placeholder-gray-400"
        />
      </div>

      {/* New note input */}
      {creating && (
        <div className="px-3 py-2 border-b border-gray-200">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') { setCreating(false); setTitle(''); }
            }}
            placeholder="Title or folder/title…"
            className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 focus:outline-none focus:border-gray-500 bg-white"
          />
        </div>
      )}

      {/* Tag filter pills */}
      {allTags.length > 0 && !search && (
        <div className="px-3 py-2 border-b border-gray-200 flex flex-wrap gap-1">
          {activeTag && (
            <button
              onClick={() => onTagClick(null)}
              className="text-xs px-2 py-0.5 rounded-full bg-gray-900 text-white"
            >
              ×
            </button>
          )}
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => onTagClick(activeTag === tag ? null : tag)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                activeTag === tag
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'border-gray-300 text-gray-500 hover:border-gray-500 hover:text-gray-700'
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Note list */}
      <nav className="flex-1 overflow-y-auto py-1">
        {/* Search results */}
        {search.trim() ? (
          searching ? (
            <p className="px-4 py-3 text-xs text-gray-400">Searching…</p>
          ) : searchResults?.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-400">No results</p>
          ) : (
            searchResults?.map((r) => (
              <button
                key={r.slug}
                onClick={() => { onSelect(r.slug); setSearch(''); }}
                className={`w-full text-left px-4 py-2 transition-colors ${
                  selectedSlug === r.slug
                    ? 'bg-gray-200 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <div className="text-xs font-medium truncate">{r.slug}</div>
                {r.excerpt && (
                  <div className="text-xs text-gray-400 truncate mt-0.5">{r.excerpt}</div>
                )}
              </button>
            ))
          )
        ) : filteredNotes.length === 0 ? (
          <p className="px-4 py-6 text-xs text-gray-400 text-center">
            {activeTag ? `No notes tagged #${activeTag}` : 'No notes yet.\nPress + to create one.'}
          </p>
        ) : (
          sortedFolders.map((folder) => (
            <div key={folder}>
              {folder && (
                <div
                  className={`px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide flex items-center justify-between gap-2 ${
                    dragOverFolder === folder ? 'bg-gray-200' : 'text-gray-400'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOverFolder(folder); }}
                  onDragLeave={() => setDragOverFolder(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    const slug = dragSlugRef.current;
                    dragSlugRef.current = null;
                    setDragOverFolder(null);
                    if (slug) void moveNoteToFolder(slug, folder);
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {(() => {
                      const meta = folderIndex.folders?.[normalizePath(folder)];
                      return meta?.color ? (
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: meta.color }} />
                      ) : null;
                    })()}
                    <span className="truncate">{folder}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <select
                      value={folderIndex.folders?.[normalizePath(folder)]?.color ?? ''}
                      onChange={(e) => onFolderColor(folder, e.target.value || undefined)}
                      className="text-[10px] font-normal text-gray-400 bg-transparent border border-transparent hover:border-gray-300 rounded px-1 py-0.5"
                      title="Folder color"
                    >
                      <option value="">Color</option>
                      {COLOR_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                      <option value="">Clear</option>
                    </select>
                    <button
                      onClick={() => editFolderTags(folder)}
                      className="text-[10px] lowercase font-normal text-gray-300 hover:text-gray-500 transition-colors"
                      title="Edit folder tags"
                    >
                      tags
                    </button>
                  </div>
                </div>
              )}
              {grouped.get(folder)!.map((note) => {
                const label = note.slug.includes('/')
                  ? note.slug.split('/').pop()!
                  : note.slug;
                const resolved = resolveFileMeta(folderIndex, note.slug);
                return (
                  <button
                    key={note.slug}
                    onClick={() => onSelect(note.slug)}
                    draggable
                    onDragStart={() => { dragSlugRef.current = note.slug; }}
                    className={`w-full text-left px-4 py-2 transition-colors ${
                      selectedSlug === note.slug
                        ? 'bg-gray-200 text-gray-900 font-medium'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {resolved.color ? (
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: resolved.color }} />
                        ) : null}
                        <div className="text-xs truncate">
                          {note.title !== 'Untitled' ? note.title : label}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <select
                          value={folderIndex.files?.[normalizePath(note.slug)]?.color ?? ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => { e.stopPropagation(); onFileColor(note.slug, e.target.value || undefined); }}
                          className="text-[10px] text-gray-400 bg-transparent border border-transparent hover:border-gray-300 rounded px-1 py-0.5"
                          title="File color"
                        >
                          <option value="">Color</option>
                          {COLOR_OPTIONS.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                          <option value="">Clear</option>
                        </select>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); editFileTags(note.slug); }}
                          className="text-[10px] text-gray-300 hover:text-gray-500 transition-colors"
                          title="Edit file tags"
                        >
                          tags
                        </button>
                      </div>
                    </div>
                    {note.tags.length > 0 && (
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {note.tags.slice(0, 3).map((t) => (
                          <span key={t} className="text-[10px] text-gray-400">#{t}</span>
                        ))}
                      </div>
                    )}

                    {resolved.tags.length > 0 && (
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {resolved.tags.slice(0, 2).map((t) => (
                          <span key={t} className="text-[10px] text-gray-300">@{t}</span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </nav>

      {/* Sign out */}
      <div className="px-4 py-3 border-t border-gray-200">
        <button
          onClick={() => window.location.href = '/api/auth/signout'}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
