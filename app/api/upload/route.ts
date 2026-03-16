import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { uploadAsset } from '@/lib/github';

export const runtime = 'edge';

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { filename, base64 } = await req.json() as { filename: string; base64: string };
  if (!filename || !base64) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  // Sanitize filename
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const result = await uploadAsset(safe, base64);
  return NextResponse.json(result);
}
