import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNote } from '@/lib/github';
import { markdownToHtml, upsertPostsJs, type BlogPost } from '@/lib/blogExport';

export const runtime = 'edge';

const GITHUB_API = 'https://api.github.com';

function h() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_PAT}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'brittle-notes',
  };
}

function encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return btoa(Array.from(bytes, (b) => String.fromCodePoint(b)).join(''));
}

function decode(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.codePointAt(0)!));
}

function blogOwner() { return process.env.BLOG_GITHUB_OWNER!; }
function blogRepo() { return process.env.BLOG_GITHUB_REPO!; }
function postsPath() { return process.env.BLOG_POSTS_PATH ?? 'data/posts.js'; }

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json() as {
      noteSlug: string;
      blogSlug?: string;
      title?: string;
      date?: string;
      meta?: string;
      tags?: string[];
    };

    const missing: string[] = [];
    if (!process.env.BLOG_GITHUB_OWNER) missing.push('BLOG_GITHUB_OWNER');
    if (!process.env.BLOG_GITHUB_REPO) missing.push('BLOG_GITHUB_REPO');
    if (missing.length) {
      return NextResponse.json(
        {
          error: `Missing required env vars: ${missing.join(', ')}`,
          hint: {
            example: {
              BLOG_GITHUB_OWNER: 'johngunerli',
              BLOG_GITHUB_REPO: 'johngunerli.com',
              BLOG_POSTS_PATH: 'data/posts.js',
            },
          },
        },
        { status: 500 }
      );
    }

    const noteSlug = body.noteSlug?.trim();
    if (!noteSlug) return NextResponse.json({ error: 'Missing noteSlug' }, { status: 400 });

    const note = await getNote(noteSlug);

    const slug = (body.blogSlug?.trim() || note.slug.split('/').pop() || note.slug).toLowerCase();

    const post: BlogPost = {
      title: body.title?.trim() || note.title || slug,
      date: body.date?.trim() || new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      meta: body.meta?.trim() || (note.tags.length ? note.tags.join(', ') : 'Notes'),
      tags: (body.tags && body.tags.length ? body.tags : note.tags).slice(0, 20),
      body: markdownToHtml(note.content),
    };

    // Fetch posts.js
    const getRes = await fetch(
      `${GITHUB_API}/repos/${blogOwner()}/${blogRepo()}/contents/${postsPath()}`,
      { headers: h() }
    );
    if (!getRes.ok) throw new Error(`Failed to fetch ${postsPath()}: ${getRes.status}`);

    const file = await getRes.json() as { content: string; sha: string };
    const source = decode(file.content);
    const nextSource = upsertPostsJs(source, slug, post);

    // Write back
    const putRes = await fetch(
      `${GITHUB_API}/repos/${blogOwner()}/${blogRepo()}/contents/${postsPath()}`,
      {
        method: 'PUT',
        headers: h(),
        body: JSON.stringify({
          message: `brittle: export ${noteSlug} -> blog/${slug}`,
          content: encode(nextSource),
          sha: file.sha,
        }),
      }
    );

    if (!putRes.ok) throw new Error(`Failed to update posts.js: ${await putRes.text()}`);

    return NextResponse.json({ ok: true, slug });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
