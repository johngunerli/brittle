import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import NotesApp from '@/components/NotesApp';

export const runtime = 'edge';

export default async function Page() {
  const session = await auth();
  if (!session) redirect('/login');
  return <NotesApp />;
}
