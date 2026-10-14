import { redirect } from 'next/navigation';
import { verifiedSession } from '@/lib/auth/session';
import Auth5Onboarding from '@/components/onboarding/Auth5Onboarding';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  let session;
  try { session = await verifiedSession(); } catch { return <main className="ob-page"><h1>Service temporairement indisponible</h1><p>Réessaie sans perdre tes données de parcours confirmées.</p></main>; }
  if (!session) redirect('/login');
  const { data, error } = await session.client.rpc('lifequest_auth5_state', { expected_actor: session.user.id });
  if (error || !data || typeof data !== 'object') return <main className="ob-page"><h1>Parcours indisponible</h1><p role="alert">Le checkpoint du parcours n’a pas pu être vérifié.</p></main>;
  const state = data as Record<string, unknown>;
  if (state.state === 'ready' && state.activationRequired !== true) redirect('/dashboard');
  if (state.state === 'ready') return <Auth5Onboarding initial={state} actor={session.user.id} />;
  if (state.state !== 'onboarding_pending') return <main className="ob-page"><h1>Hunter en attente</h1><p role="status">La configuration serveur ne permet pas de lancer ce parcours.</p><a href="/login">Revenir à la connexion</a></main>;
  return <Auth5Onboarding initial={state} actor={session.user.id} />;
}
