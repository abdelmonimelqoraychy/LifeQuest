import { redirect } from 'next/navigation';
import { verifiedSession } from '@/lib/auth/session';
import HunterPending from './HunterPending';
import AuthShell from './AuthShell';
import { cookies } from 'next/headers';
export default async function ProtectedHunter() {
  if ((await cookies()).get('lifequest-access-locked')?.value === '1') return <HunterPending actor="" initiallyLocked />;
  let session;
  try { session = await verifiedSession(); }
  catch { return <AuthShell><h1>Accès momentanément indisponible</h1><p>La vérification de votre session a échoué. Réessayez dans un instant.</p><a href="/login">Revenir à la connexion</a></AuthShell>; }
  if (!session) redirect('/login');
  // Legacy children are deliberately never mounted until AUTH-4 cloud readers exist.
  return <HunterPending actor={session.user.id} />;
}
