import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { searchNotes } from '@/lib/github';

export const runtime = 'edge';

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = new URL(req.url).searchParams.get('q')?.trim();
  if (!q) return NextResponse.json([]);

  const results = await searchNotes(q);
  return NextResponse.json(results);
}
