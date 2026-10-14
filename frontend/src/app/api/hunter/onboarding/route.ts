import { NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/auth/session';
import { authBody, appOrigin } from '@/lib/auth/requests';
import { hunterReadHeaders } from '@/lib/hunter/read';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const codes: Record<string, number> = {
  SESSION_EXPIRED: 401, ACTOR_MISMATCH: 403, ACCOUNT_MISSING: 409, SETUP_PENDING: 409,
  ONBOARDING_STEP_LOCKED: 409, ONBOARDING_INCOMPLETE: 409, REQUEST_ID_CONFLICT: 409,
  VALIDATION_FAILED: 400, SNAPSHOT_INCONSISTENT: 409,
};
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: hunterReadHeaders });

export async function GET() {
  let session;
  try { session = await verifiedSession(); } catch { return json({ code: 'AUTH_UNAVAILABLE' }, 503); }
  if (!session) return json({ code: 'AUTH_REQUIRED' }, 401);
  const { data, error } = await session.client.rpc('lifequest_auth5_state', { expected_actor: session.user.id });
  if (error) {
    const code = Object.keys(codes).find(candidate => error.message === candidate) || 'ONBOARDING_UNAVAILABLE';
    return json({ code }, codes[code] || 503);
  }
  return json(data);
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== appOrigin()) return json({ code: 'REQUEST_REFUSED' }, 400);
  let body: Record<string, unknown>;
  try { body = await authBody(request); } catch { return json({ code: 'REQUEST_REFUSED' }, 400); }
  if (typeof body.kind !== 'string' || !['video.checkpoint', 'video.finish', 'activation.checkpoint', 'activation.finish', 'draft.save', 'onboarding.complete'].includes(body.kind)
    || typeof body.requestId !== 'string' || !uuid.test(body.requestId) || !body.payload || Array.isArray(body.payload) || typeof body.payload !== 'object') {
    return json({ code: 'REQUEST_REFUSED' }, 400);
  }
  let session;
  try { session = await verifiedSession(true); } catch { return json({ code: 'AUTH_UNAVAILABLE' }, 503); }
  if (!session) return json({ code: 'AUTH_REQUIRED' }, 401);
  const { data, error } = await session.client.rpc('lifequest_auth5_command', {
    expected_actor: session.user.id, request_id: body.requestId, kind: body.kind, payload: body.payload,
  });
  if (error) {
    const code = Object.keys(codes).find(candidate => error.message === candidate)
      || (error.code === '42501' ? 'AUTH_REQUIRED' : 'ONBOARDING_UNAVAILABLE');
    return json({ code }, codes[code] || (code === 'AUTH_REQUIRED' ? 401 : 503));
  }
  return json(data);
}
