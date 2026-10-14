import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { appOrigin } from '@/lib/auth/requests';
import { grantRecovery } from '@/lib/auth/recovery';
import { cookies } from 'next/headers';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  let destination = '/login?notice=link-invalid';
  try {
    const params = new URL(request.url).searchParams;
    const type = params.get('type'); const token = params.get('token_hash');
    if (token && token.length <= 512 && (type === 'email' || type === 'recovery')) {
      // No next/returnTo from the link is used. Destinations are fixed.
      const client = await createSupabaseServerClient();
      const result = await client.auth.verifyOtp({ type, token_hash: token });
      if (!result.error && result.data.user && !result.data.user.is_anonymous) {
        const active = await client.rpc('lifequest_session_active');
        if (active.data === true && !active.error) {
          (await cookies()).delete('lifequest-access-locked');
          destination = '/auth/loading';
          if (type === 'recovery') {
            const claims = await client.auth.getClaims(); const sid = claims.data?.claims.session_id;
            if (typeof sid !== 'string') throw new Error('RECOVERY_REQUIRED');
            await grantRecovery(result.data.user.id, sid); destination = '/update-password';
          }
        }
      }
    }
  } catch { destination = '/login?notice=auth-unavailable'; }
  const response = NextResponse.redirect(new URL(destination, appOrigin()), 303);
  response.headers.set('Cache-Control', 'private, no-store'); response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
