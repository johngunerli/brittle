'use client';

import { useState, useEffect, useRef } from 'react';
import type { NoteMeta } from '@/lib/github';
import Uploader, { type ConvertedDoc } from './Uploader';

interface Props {
  notes: NoteMeta[];
  selectedSlug: string | null;
  activeTag: string | null;
  onSelect: (slug: string) => void;
  onNew: (title: string) => void;
  onUpload: (doc: ConvertedDoc) => void;
  onTagClick: (tag: string | null) => void;
  onGraphOpen: () => void;
}

export default function NoteList({
  notes, selectedSlug, activeTag,
  onSelect, onNew, onUpload, onTagClick, onGraphOpen,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle]       = useState('');
  const [search, setSearch]     = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ slug: string; excerpt: string }> | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const sortedFolders = [...grouped.keys()].sort((a, b) => {
    if (a === '') return -1;
    if (b === '') return 1;
    return a.localeCompare(b);
  });

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
    <aside className="w-60 flex-shrink-0 flex flex-col border-r border-gray-200 bg-gray-50">
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
                <div className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {folder}
                </div>
              )}
              {grouped.get(folder)!.map((note) => {
                const label = note.slug.includes('/')
                  ? note.slug.split('/').pop()!
                  : note.slug;
                return (
                  <button
                    key={note.slug}
                    onClick={() => onSelect(note.slug)}
                    className={`w-full text-left px-4 py-2 transition-colors ${
                      selectedSlug === note.slug
                        ? 'bg-gray-200 text-gray-900 font-medium'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <div className="text-xs truncate">
                      {note.title !== 'Untitled' ? note.title : label}
                    </div>
                    {note.tags.length > 0 && (
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {note.tags.slice(0, 3).map((t) => (
                          <span key={t} className="text-[10px] text-gray-400">#{t}</span>
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
