'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import NoteList from './NoteList';
import Editor from './Editor';
import type { NoteMeta } from '@/lib/github';
import { slugify } from '@/lib/parse';
import type { ConvertedDoc } from './Uploader';
import type { FolderIndex } from '@/lib/folders';
import { normalizePath, ensureFolderEntity } from '@/lib/folders';

// Graph is canvas-heavy — load client-side only
const Graph = dynamic(() => import('./Graph'), { ssr: false });

export default function NotesApp() {
  const [notes, setNotes]           = useState<NoteMeta[]>([]);
  const [selectedSlug, setSelected] = useState<string | null>(null);
  const [content, setContent]       = useState('');
  const [sha, setSha]               = useState<string | undefined>();
  const [isDirty, setIsDirty]       = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [loading, setLoading]       = useState(false);
  const [activeTag, setActiveTag]   = useState<string | null>(null);
  const [showGraph, setShowGraph]   = useState(false);
  const [folderIndex, setFolderIndex] = useState<FolderIndex>({});
  const [folderSha, setFolderSha] = useState<string | undefined>();

  // Fetch note list on mount
  useEffect(() => {
    fetch('/api/notes')
      .then((r) => r.json())
      .then((data: NoteMeta[]) => setNotes(data));
  }, []);

  // Fetch folder/file metadata on mount
  useEffect(() => {
    fetch('/api/folders')
      .then((r) => r.json())
      .then((data: { index: FolderIndex; sha?: string }) => {
        setFolderIndex(data.index ?? {});
        setFolderSha(data.sha);
      })
      .catch(() => {
        // ignore — optional
      });
  }, []);

  const saveFolderIndex = useCallback(async (next: FolderIndex) => {
    const res = await fetch('/api/folders', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index: next, sha: folderSha }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? 'Failed to save folder metadata');
      return;
    }
    const data = await res.json() as { sha: string };
    setFolderIndex(next);
    setFolderSha(data.sha);

    // Refresh notes so list/graph reflect new colors immediately
    fetch('/api/notes')
      .then((r) => r.json())
      .then((fresh: NoteMeta[]) => setNotes(fresh));
  }, [folderSha]);

  const setFolderColor = useCallback((folder: string, color?: string) => {
    const f = normalizePath(folder);
    const next: FolderIndex = {
      ...folderIndex,
      folders: { ...(folderIndex.folders ?? {}) },
      files: folderIndex.files ?? {},
    };
    const existing = next.folders![f] ?? {};
    next.folders![f] = { ...existing, color: color || undefined };
    void saveFolderIndex(next);
  }, [folderIndex, saveFolderIndex]);

  const setFolderTags = useCallback((folder: string, tags: string[]) => {
    const f = normalizePath(folder);
    const next: FolderIndex = {
      ...folderIndex,
      folders: { ...(folderIndex.folders ?? {}) },
      files: folderIndex.files ?? {},
    };
    const existing = next.folders![f] ?? {};
    next.folders![f] = { ...existing, tags };
    void saveFolderIndex(next);
  }, [folderIndex, saveFolderIndex]);

  const setFileColor = useCallback((slug: string, color?: string) => {
    const s = normalizePath(slug);
    const next: FolderIndex = {
      ...folderIndex,
      folders: folderIndex.folders ?? {},
      files: { ...(folderIndex.files ?? {}) },
    };
    const existing = next.files![s] ?? {};
    next.files![s] = { ...existing, color: color || undefined };
    void saveFolderIndex(next);
  }, [folderIndex, saveFolderIndex]);

  const setFileTags = useCallback((slug: string, tags: string[]) => {
    const s = normalizePath(slug);
    const next: FolderIndex = {
      ...folderIndex,
      folders: folderIndex.folders ?? {},
      files: { ...(folderIndex.files ?? {}) },
    };
    const existing = next.files![s] ?? {};
    next.files![s] = { ...existing, tags };
    void saveFolderIndex(next);
  }, [folderIndex, saveFolderIndex]);

  // Load note when selected
  const selectNote = useCallback((slug: string) => {
    setSelected(slug);
    setLoading(true);
    fetch(`/api/notes/${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data: { content: string; sha: string; tags: string[]; links: string[] }) => {
        setContent(data.content);
        setSha(data.sha);
        setIsDirty(false);
        setSaveStatus('saved');
        // Update metadata in notes list (tags/links may have been refreshed from index)
        setNotes((prev) =>
          prev.map((n) =>
            n.slug === slug
              ? { ...n, tags: data.tags, links: data.links }
              : n
          )
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async () => {
    if (!selectedSlug || !isDirty) return;
    setSaveStatus('saving');
    try {
      const res  = await fetch(`/api/notes/${encodeURIComponent(selectedSlug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, sha }),
      });
      const data = await res.json() as { sha: string };
      setSha(data.sha);
      setIsDirty(false);
      setSaveStatus('saved');

      // Refresh notes list to pick up updated tags/links from the index
      fetch('/api/notes')
        .then((r) => r.json())
        .then((fresh: NoteMeta[]) => setNotes(fresh));
    } catch {
      setSaveStatus('unsaved');
    }
  }, [selectedSlug, isDirty, content, sha]);

  // ⌘S / Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [save]);

  const handleChange = (value: string) => {
    setContent(value);
    setIsDirty(true);
    setSaveStatus('unsaved');
  };

  const handleNewNote = async (title: string) => {
    // Support folder/title syntax
    const raw   = title.trim();
    const parts = raw.split('/');
    const slug  = parts.map((p, i) =>
      i === parts.length - 1 ? slugify(p) : slugify(p)
    ).join('/') || `note-${Date.now()}`;

    const initialContent = `# ${parts[parts.length - 1].trim()}\n\n`;
    const res  = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, content: initialContent }),
    });
    const data = await res.json() as { sha: string };

    const newNote: NoteMeta = {
      slug,
      sha: data.sha,
      title: parts[parts.length - 1].trim(),
      tags: [],
      links: [],
    };
    setNotes((prev) => [newNote, ...prev]);
    setSelected(slug);
    setContent(initialContent);
    setSha(data.sha);
    setIsDirty(false);
    setSaveStatus('saved');
  };

  const handleUpload = async ({ slug, content }: ConvertedDoc) => {
    // Ensure unique slug if it already exists
    const existing = notes.find((n) => n.slug === slug);
    const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

    const res  = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: finalSlug, content }),
    });
    const data = await res.json() as { sha: string };

    const newNote: NoteMeta = { slug: finalSlug, sha: data.sha, title: finalSlug, tags: [], links: [] };
    setNotes((prev) => [newNote, ...prev]);
    setSelected(finalSlug);
    setContent(content);
    setSha(data.sha);
    setIsDirty(false);
    setSaveStatus('saved');
  };

  const handleDelete = async () => {
    if (!selectedSlug || !sha) return;
    if (!confirm(`Delete "${selectedSlug}"?`)) return;
    await fetch(`/api/notes/${encodeURIComponent(selectedSlug)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha }),
    });
    setNotes((prev) => prev.filter((n) => n.slug !== selectedSlug));
    setSelected(null);
    setContent('');
    setSha(undefined);
    setSaveStatus('saved');
  };

  const handleRename = useCallback(async (to: string) => {
    if (!selectedSlug) return;
    const next = to.trim();
    if (!next || next === selectedSlug) return;

    if (isDirty) {
      const ok = confirm('This note has unsaved changes. Save before renaming?');
      if (ok) await save();
    }

    const res = await fetch('/api/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: selectedSlug, to: next, sha }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error ?? 'Rename failed');
      return;
    }

    const data = await res.json() as { sha: string };

    setSelected(next);
    setSha(data.sha);
    setIsDirty(false);
    setSaveStatus('saved');

    // Refresh from index for accurate title/tags/links
    const listRes = await fetch('/api/notes');
    const fresh = await listRes.json() as NoteMeta[];
    setNotes(fresh);

    // Load the moved note content (also rehydrates tags/links on the note)
    selectNote(next);
  }, [selectedSlug, sha, isDirty, save, selectNote]);

  return (
    <>
      <div className="flex h-screen">
        <NoteList
          notes={notes}
          selectedSlug={selectedSlug}
          activeTag={activeTag}
          onSelect={selectNote}
          onNew={handleNewNote}
          onUpload={handleUpload}
          onTagClick={setActiveTag}
          onGraphOpen={() => setShowGraph(true)}
          onMoved={() => {
            fetch('/api/notes')
              .then((r) => r.json())
              .then((fresh: NoteMeta[]) => setNotes(fresh));
          }}
          onCreateFolder={(folder) => {
            const next = ensureFolderEntity(folderIndex, folder);
            void saveFolderIndex(next);
          }}
          folderIndex={folderIndex}
          onFolderColor={setFolderColor}
          onFolderTags={setFolderTags}
          onFileColor={setFileColor}
          onFileTags={setFileTags}
        />
        <Editor
          slug={selectedSlug}
          content={content}
          loading={loading}
          saveStatus={saveStatus}
          notes={notes}
          onChange={handleChange}
          onSave={save}
          onRename={handleRename}
          onDelete={handleDelete}
          onNavigate={selectNote}
        />
      </div>

      {showGraph && (
        <Graph
          notes={notes}
          selectedSlug={selectedSlug}
          onSelect={selectNote}
          onClose={() => setShowGraph(false)}
        />
      )}
    </>
  );
}
