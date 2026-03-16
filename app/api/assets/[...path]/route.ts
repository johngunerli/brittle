import { auth } from '@/auth';
import { getAsset } from '@/lib/github';

export const runtime = 'edge';

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { path } = await params;
  const assetPath = `assets/${path.join('/')}`;

  const { data, contentType } = await getAsset(assetPath);
  return new Response(data.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
