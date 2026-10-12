import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { verifiedSession } from '@/lib/auth/session';
import { appOrigin, authBody, emailValid, passwordValid } from '@/lib/auth/requests';
import { clearRecovery, recoveryAllowed } from '@/lib/auth/recovery';
import { cookies } from 'next/headers';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'Referrer-Policy': 'no-referrer' };
const reply = (code: string, status = 200) => NextResponse.json({ code }, { status, headers });

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await context.params;
    if (!['register', 'login', 'forgot-password', 'logout', 'update-password', 'resend'].includes(action)) return reply('NOT_FOUND', 404);
    const body = await authBody(request);
    const client = await createSupabaseServerClient();
    if (action === 'logout') {
      const result = await client.auth.signOut({ scope: 'global' });
      if (result.error && result.error.status !== 401 && result.error.status !== 403) return reply('AUTH_UNAVAILABLE', 503);
      await clearRecovery(); (await cookies()).delete('lifequest-access-locked'); return reply('SIGNED_OUT');
    }
    if (action === 'update-password') {
      if (!passwordValid(body.password) || body.password !== body.confirmPassword) return reply('PASSWORD_INVALID', 400);
      const session = await verifiedSession(true);
      if (!session) return reply('AUTH_REQUIRED', 401);
      const claims = await session.client.auth.getClaims();
      const sid = claims.data?.claims.session_id;
      if (typeof sid !== 'string' || !(await recoveryAllowed(session.user.id, sid))) return reply('RECOVERY_REQUIRED', 403);
      const result = await session.client.auth.updateUser({ password: body.password });
      if (result.error) return reply('PASSWORD_UPDATE_REFUSED', 400);
      const logout = await session.client.auth.signOut({ scope: 'global' });
      if (logout.error) return reply('AUTH_UNAVAILABLE', 503);
      await clearRecovery(); return reply('PASSWORD_UPDATED');
    }
    if (!emailValid(body.email)) return reply('EMAIL_INVALID', 400);
    const email = body.email.trim().toLowerCase();
    if (action === 'register') {
      if (!passwordValid(body.password) || body.password !== body.confirmPassword) return reply('PASSWORD_INVALID', 400);
      const result = await client.auth.signUp({ email, password: body.password, options: { emailRedirectTo: appOrigin() + '/auth/confirm' } });
      if (result.error && result.error.status && result.error.status >= 500) return reply('AUTH_UNAVAILABLE', 503);
      if (result.error?.status === 429) return reply('RATE_LIMITED', 429);
      // Supabase conceals already registered addresses. Never return account details.
      return reply('CHECK_EMAIL');
    }
    if (action === 'login') {
      if (typeof body.password !== 'string' || body.password.length > 128) return reply('LOGIN_REFUSED', 400);
      const result = await client.auth.signInWithPassword({ email, password: body.password });
      if (result.error) return reply(result.error.status === 429 ? 'RATE_LIMITED' : 'LOGIN_REFUSED', result.error.status === 429 ? 429 : 401);
      (await cookies()).delete('lifequest-access-locked');
      if (!(await verifiedSession(true))) return reply('AUTH_REQUIRED', 401);
      await clearRecovery(); return reply('SIGNED_IN');
    }
    const result = action === 'resend'
      ? await client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: appOrigin() + '/auth/confirm' } })
      : await client.auth.resetPasswordForEmail(email, { redirectTo: appOrigin() + '/auth/confirm' });
    if (result.error?.status === 429) return reply('RATE_LIMITED', 429);
    if (result.error?.status && result.error.status >= 500) return reply('AUTH_UNAVAILABLE', 503);
    return reply('CHECK_EMAIL');
  } catch (error) {
    return reply(error instanceof Error && error.message === 'REQUEST_REFUSED' ? 'REQUEST_REFUSED' : 'AUTH_UNAVAILABLE', error instanceof Error && error.message === 'REQUEST_REFUSED' ? 403 : 503);
  }
}
