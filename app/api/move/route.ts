import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { moveNote } from '@/lib/github';

export const runtime = 'edge';

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json() as {
      from: string;
      to: string;
      sha?: string;
    };

    const from = body.from?.trim();
    const to = body.to?.trim();
    if (!from || !to) return NextResponse.json({ error: 'Missing from/to' }, { status: 400 });
    if (from === to) return NextResponse.json({ error: 'from and to must differ' }, { status: 400 });

    const result = await moveNote(from, to, body.sha);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
