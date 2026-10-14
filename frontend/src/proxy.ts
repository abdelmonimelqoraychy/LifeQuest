import type { NextRequest } from 'next/server';
import { refreshAuthSession } from '@/lib/supabase/proxy';

export const proxy = (request: NextRequest) => refreshAuthSession(request);
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:mp4|png|jpg|svg|webp)$).*)'] };
