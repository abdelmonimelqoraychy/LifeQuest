import { redirect } from 'next/navigation';
import { verifiedSession } from '@/lib/auth/session';
import HunterPending from './HunterPending';
import AuthShell from './AuthShell';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { readHunterRpc } from '@/lib/hunter/read';
import { HunterCloudProvider, type HunterSnapshot } from '@/lib/hunter/cloud';
import SessionLogout from './SessionLogout';

export default async function ProtectedHunter({ children }: { children?: ReactNode }) {
  if ((await cookies()).get('lifequest-access-locked')?.value === '1') return <HunterPending actor="" initiallyLocked />;
  let session;
  try { session = await verifiedSession(); }
  catch { return <AuthShell><h1>Accès momentanément indisponible</h1><p>La vérification de votre session a échoué. Réessayez dans un instant.</p><a href="/login">Revenir à la connexion</a></AuthShell>; }
  if (!session) redirect('/login');
  const response = await readHunterRpc<HunterSnapshot>('lifequest_hunter_snapshot', {});
  const snapshot = await response.json() as HunterSnapshot;
  if (!response.ok) return <AuthShell><h1>Progression cloud indisponible</h1><p role="alert">Le snapshot Hunter n’a pas pu être vérifié. Aucune donnée locale ne sera affichée.</p><a href="/auth/loading">Réessayer</a><SessionLogout /></AuthShell>;
  if (snapshot.state !== 'ready') {
    if (!children && (snapshot.state === 'setup_pending' || snapshot.state === 'onboarding_pending')) redirect('/onboarding');
    const messages: Record<string, string> = {
      setup_pending: 'Le compte Hunter attend la configuration de son fuseau et de ses modules.',
      migration_pending: 'La progression Hunter attend une vérification de migration.',
      recovery_required: 'La progression Hunter nécessite une vérification avant son ouverture.',
      onboarding_pending: 'Le parcours de configuration Hunter doit être terminé avant l’ouverture du dashboard.',
    };
    return <AuthShell><h1>Progression Hunter en attente</h1><p role="status">{messages[snapshot.state] || 'La progression cloud n’est pas prête.'}</p><p>Vos données locales restent séparées et ne seront pas importées automatiquement.</p>{snapshot.state === 'setup_pending' || snapshot.state === 'onboarding_pending' ? <a href="/onboarding">Reprendre l’introduction et la création du Hunter</a> : null}<SessionLogout /></AuthShell>;
  }
  if (!children) redirect('/dashboard');
  return <HunterCloudProvider key={session.user.id} actor={session.user.id} initial={snapshot}>{children}</HunterCloudProvider>;
}
