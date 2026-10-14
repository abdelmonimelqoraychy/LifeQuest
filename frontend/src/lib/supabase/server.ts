import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseConfig } from './config';
import { appOrigin } from '@/lib/auth/requests';

export async function createSupabaseServerClient(writable = true) {
  const store = await cookies();
  const { url, key } = supabaseConfig();
  return createServerClient(url, key, {
    cookieOptions: { secure: appOrigin().startsWith('https://'), sameSite: 'lax' },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    cookies: {
      getAll: () => store.getAll(),
      // Route Handlers support writes. For future Server Components, Proxy refreshes.
      setAll: values => {
        if (!writable) return; // Server Components: refresh and writes belong to Proxy/handlers.
        for (const { name, value, options } of values) store.set(name, value, options);
      },
    },
  });
}
