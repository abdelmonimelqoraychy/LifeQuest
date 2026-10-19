import { NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/auth/session';
import { appOrigin } from '@/lib/auth/requests';
import { hunterReadHeaders } from '@/lib/hunter/read';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const questKinds = new Set(['quest.create','quest.update','quest.archive','quest.restore','quest.complete','arc.create','arc.delete','achievement.sync']);
const operationsKinds = new Set(['boss.create','boss.progress','boss.claim','focus.start','focus.pause','focus.resume','focus.cancel','focus.finish','focus.claim','focus.set_mode']);
const labKinds = new Set(['idea.create','idea.set_archived','idea.delete','node.create','node.delete','resource.create','resource.set_mastered','resource.delete','journal.save','journal.delete','creativity.submit']);
const profileKinds = new Set(['profile.class.select']);
const knownErrors: Record<string, number> = {
  VALIDATION_FAILED: 400, NOT_DUE: 409, NOT_FOUND: 404, REVISION_CONFLICT: 409, SOURCE_ALREADY_CONVERTED: 409, MIND_MAP_SOURCE_IN_USE: 409,
  COMMAND_CONFLICT: 409, COMMAND_UNKNOWN: 400, CALENDAR_NOT_ACTIVE: 503,
  CALENDAR_MISMATCH: 503, CALENDAR_UNVERIFIED: 503, SESSION_EXPIRED: 401, ACCOUNT_MISSING: 409,
  SNAPSHOT_INCONSISTENT: 409, UNSUPPORTED_NUMBER: 409, ONCE_TERMINAL: 409,
  FOCUS_STATE_INVALID: 409, FOCUS_DURATION_UNVERIFIED: 409, HISTORICAL_FOCUS_UNVERIFIED: 409,
  REQUEST_ID_CONFLICT: 409, SETUP_PENDING: 409, MODULE_INVALID: 409,
};
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

async function bodyOf(request: Request) {
  if (request.headers.get('origin') !== appOrigin() || request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw new Error('REQUEST_REFUSED');
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 65_536) throw new Error('REQUEST_REFUSED');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('REQUEST_REFUSED');
  let bytes = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const part = await reader.read(); if (part.done) break;
    bytes += part.value.byteLength; if (bytes > 65_536) { await reader.cancel(); throw new Error('REQUEST_REFUSED'); }
    chunks.push(part.value);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!isRecord(parsed) || typeof parsed.kind !== 'string' || !isRecord(parsed.payload)
    || typeof parsed.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.requestId)) throw new Error('REQUEST_REFUSED');
  return parsed as { kind: string; payload: Record<string, unknown>; requestId: string };
}

export async function POST(request: Request) {
  let input: Awaited<ReturnType<typeof bodyOf>>;
  try { input = await bodyOf(request); }
  catch { return NextResponse.json({ code: 'REQUEST_REFUSED' }, { status: 400, headers: hunterReadHeaders }); }
  let session;
  try { session = await verifiedSession(true); }
  catch { return NextResponse.json({ code: 'AUTH_UNAVAILABLE' }, { status: 503, headers: hunterReadHeaders }); }
  if (!session) return NextResponse.json({ code: 'AUTH_REQUIRED' }, { status: 401, headers: hunterReadHeaders });

  const rpc = profileKinds.has(input.kind) ? 'lifequest_profile_command'
    : questKinds.has(input.kind) ? 'lifequest_quest_command'
    : operationsKinds.has(input.kind) ? 'lifequest_operations_command'
      : labKinds.has(input.kind) ? 'lifequest_lab_command' : null;
  if (!rpc) return NextResponse.json({ code: 'COMMAND_UNKNOWN' }, { status: 400, headers: hunterReadHeaders });
  const { data, error } = await session.client.rpc(rpc, {
    expected_actor: session.user.id,
    request_id: input.requestId,
    kind: input.kind,
    payload: input.payload,
  });
  if (error) {
    const code = Object.keys(knownErrors).find(candidate => error.message === candidate) || (error.code === '42501' ? 'AUTH_REQUIRED' : 'COMMAND_UNAVAILABLE');
    return NextResponse.json({ code }, { status: knownErrors[code] || (code === 'AUTH_REQUIRED' ? 401 : 503), headers: hunterReadHeaders });
  }
  if (!isRecord(data) || typeof data.requestId !== 'string' || data.requestId !== input.requestId) {
    return NextResponse.json({ code: 'COMMAND_RESULT_INVALID' }, { status: 503, headers: hunterReadHeaders });
  }
  return NextResponse.json(data, { headers: hunterReadHeaders });
}
