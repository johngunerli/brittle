'use client';

import { useRef, useState } from 'react';
import { slugify } from '@/lib/parse';

export interface ConvertedDoc {
  slug: string;
  content: string;
}

interface Props {
  onConverted: (doc: ConvertedDoc) => void;
}

export default function Uploader({ onConverted }: Props) {
  const [status, setStatus] = useState<'idle' | 'converting' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    // Reset input so the same file can be re-selected
    if (inputRef.current) inputRef.current.value = '';

    setStatus('converting');
    setErrorMsg('');

    try {
      const content = await convertFile(file);
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const slug = slugify(baseName) || `import-${Date.now()}`;
      onConverted({ slug, content });
      setStatus('idle');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Conversion failed');
      setStatus('error');
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept=".md,.txt,.docx,.pdf"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        onClick={() => { setStatus('idle'); inputRef.current?.click(); }}
        disabled={status === 'converting'}
        title="Upload & convert document (.docx, .pdf, .txt, .md)"
        className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors text-xs disabled:opacity-40"
      >
        {status === 'converting' ? (
          <span className="animate-spin inline-block">↻</span>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        )}
      </button>

      {status === 'error' && (
        <div className="absolute left-0 top-8 z-10 bg-red-50 border border-red-200 text-red-600 text-xs rounded px-2 py-1.5 w-48 shadow-sm">
          {errorMsg}
          <button onClick={() => setStatus('idle')} className="ml-1 underline">dismiss</button>
        </div>
      )}
    </div>
  );
}

// ─── Converters (all run client-side in the browser) ─────────────────────────

async function convertFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.md') || name.endsWith('.txt')) {
    return file.text();
  }

  if (name.endsWith('.docx')) {
    return convertDocx(file);
  }

  if (name.endsWith('.pdf')) {
    return convertPdf(file);
  }

  throw new Error(`Unsupported file type: ${file.name.split('.').pop()}`);
}

async function convertDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const TurndownService = (await import('turndown')).default;

  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });

  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
  // Preserve tables
  td.addRule('table', {
    filter: ['table'],
    replacement: (_content, node) => {
      // Let turndown handle table via default, just ensure spacing
      return '\n\n' + _content + '\n\n';
    },
  });

  const markdown = td.turndown(result.value);

  // Prepend a title from the filename
  const title = file.name.replace(/\.docx$/i, '');
  return `# ${title}\n\n${markdown}`;
}

async function convertPdf(file: File): Promise<string> {
  // Load pdfjs with CDN worker to avoid bundling the heavy worker file
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const title = file.name.replace(/\.pdf$/i, '');
  const lines: string[] = [`# ${title}\n`];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Reconstruct text — group items by approximate Y position to detect line breaks
    const items = textContent.items.filter(
      (i): i is import('pdfjs-dist/types/src/display/api').TextItem =>
        'str' in i && typeof (i as { str: string }).str === 'string' && (i as { str: string }).str.trim() !== ''
    );

    if (items.length === 0) continue;

    // Group by Y position (rounded to nearest 5px) to detect paragraphs
    const byY = new Map<number, string[]>();
    for (const item of items) {
      const y = Math.round(item.transform[5] / 5) * 5;
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y)!.push(item.str);
    }

    const pageLines = [...byY.entries()]
      .sort((a, b) => b[0] - a[0]) // PDF Y-axis is bottom-up
      .map(([, words]) => words.join(' ').trim())
      .filter(Boolean);

    if (pdf.numPages > 1) {
      lines.push(`## Page ${pageNum}`);
    }
    lines.push(pageLines.join('\n'));
  }

  return lines.join('\n\n');
}
