import { readHunterRpc } from '@/lib/hunter/read';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await context.params;
  if (!UUID.test(requestId)) {
    return NextResponse.json({ code: 'VALIDATION_FAILED' }, {
      status: 400,
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    });
  }
  return readHunterRpc('lifequest_command_receipt', { request_id: requestId });
}
