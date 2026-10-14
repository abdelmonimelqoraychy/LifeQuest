import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseConfig } from './config';
import { appOrigin } from '@/lib/auth/requests';

export async function refreshAuthSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set('Cache-Control', 'private, no-store');
  try {
    const { url, key } = supabaseConfig();
    const supabase = createServerClient(url, key, {
      cookieOptions: { secure: appOrigin().startsWith('https://'), sameSite: 'lax' },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: values => {
          for (const { name, value } of values) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of values) response.cookies.set(name, value, options);
          response.headers.set('Cache-Control', 'private, no-store');
        },
      },
    });
    // A cookie or getSession() is never accepted as proof of authorization.
    await supabase.auth.getClaims();
  } catch {
    // The endpoint performs authoritative checks and returns fixed safe diagnostics.
  }
  return response;
}
