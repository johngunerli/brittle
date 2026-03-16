import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listNotes, saveNote } from '@/lib/github';

export const runtime = 'edge';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const notes = await listNotes();
    return NextResponse.json(notes);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { slug, content } = await req.json() as { slug: string; content: string };
    if (!slug) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
    const result = await saveNote(slug, content);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
