import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' };
const failure = (code: string, status: number) => NextResponse.json({ code }, { status, headers });

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) return failure(error.status && error.status >= 500 ? 'AUTH_UNAVAILABLE' : 'AUTH_REQUIRED', error.status && error.status >= 500 ? 503 : 401);
    const user = data.user;
    if (!user || user.is_anonymous || !user.email_confirmed_at) return failure('AUTH_REQUIRED', 401);
    const session = await supabase.rpc('lifequest_session_active');
    if (session.error) return failure('AUTH_UNAVAILABLE', 503);
    if (session.data !== true) return failure('AUTH_REQUIRED', 401);
    // No localStorage, zero-account fallback, onboarding reset or RPG snapshot.
    return NextResponse.json({ actor: user.id, state: 'cloud_not_connected' }, { headers });
  } catch {
    return failure('AUTH_CONFIGURATION_UNAVAILABLE', 503);
  }
}
