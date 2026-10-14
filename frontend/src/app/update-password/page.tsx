import { redirect } from 'next/navigation';
import AuthForm from '@/components/auth/AuthForm';
import { verifiedSession } from '@/lib/auth/session';
import { recoveryAllowed } from '@/lib/auth/recovery';
export const dynamic = 'force-dynamic';
export default async function Page() {
 let allowed = false;
 try { const session = await verifiedSession(); if (session) { const claims = await session.client.auth.getClaims(); const sid = claims.data?.claims.session_id; allowed = typeof sid === 'string' && await recoveryAllowed(session.user.id, sid); } } catch { allowed = false; }
 if (!allowed) redirect('/forgot-password');
 return <AuthForm mode="update-password" />;
}
