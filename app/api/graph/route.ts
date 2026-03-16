import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listNotes } from '@/lib/github';

export const runtime = 'edge';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // listNotes already returns links from the index — no extra fetches needed
  const notes = await listNotes();
  return NextResponse.json(notes);
}
