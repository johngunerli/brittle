import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getNote, saveNote, deleteNote } from '@/lib/github';

export const runtime = 'edge';

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await params;
  const note = await getNote(decodeURIComponent(slug));
  return NextResponse.json(note);
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await params;
  const { content, sha } = await req.json() as { content: string; sha?: string };
  const result = await saveNote(decodeURIComponent(slug), content, sha);
  return NextResponse.json(result);
}

export async function DELETE(req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await params;
  const { sha } = await req.json() as { sha: string };
  await deleteNote(decodeURIComponent(slug), sha);
  return NextResponse.json({ ok: true });
}
