'use client';
import { createBrowserClient } from '@supabase/ssr';
import { supabaseConfig } from './config';

// Not mounted by the local RPG. Cookie sessions are isolated from legacy storage.
export function createSupabaseBrowserClient() {
  const { url, key } = supabaseConfig();
  return createBrowserClient(url, key, { isSingleton: false });
}
