import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getFolderMetadata, updateFolderMetadata } from '@/lib/github';
import type { FolderIndex } from '@/lib/folders';

export const runtime = 'edge';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await getFolderMetadata();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json() as { index: FolderIndex; sha?: string };
    const result = await updateFolderMetadata(body.index ?? {}, body.sha);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
