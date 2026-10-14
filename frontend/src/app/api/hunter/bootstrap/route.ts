import { readHunterRpc } from '@/lib/hunter/read';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  // The existing public Auth bootstrap intentionally remains cloud_not_connected.
  // This read-only endpoint is a server boundary for AUTH-4E; no RPG component calls it yet.
  return readHunterRpc('lifequest_hunter_snapshot', {});
}
