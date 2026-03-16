'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import NoteList from './NoteList';
import Editor from './Editor';
import type { NoteMeta } from '@/lib/github';
import { slugify } from '@/lib/parse';
import type { ConvertedDoc } from './Uploader';

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

  // Fetch note list on mount
  useEffect(() => {
    fetch('/api/notes')
      .then((r) => r.json())
      .then((data: NoteMeta[]) => setNotes(data));
  }, []);

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
        />
        <Editor
          slug={selectedSlug}
          content={content}
          loading={loading}
          saveStatus={saveStatus}
          notes={notes}
          onChange={handleChange}
          onSave={save}
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
