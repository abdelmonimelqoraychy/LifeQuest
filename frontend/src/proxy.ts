import type { NextRequest } from 'next/server';
import { refreshAuthSession } from '@/lib/supabase/proxy';

export const proxy = (request: NextRequest) => refreshAuthSession(request);
// AUTH-2 only. Global gameplay routing is deliberately deferred to AUTH-3/4.
export const config = { matcher: ['/api/auth/:path*'] };
