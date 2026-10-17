import 'server-only';
import { NextResponse } from 'next/server';
import { verifiedSession } from '@/lib/auth/session';
import { isHunterClassCode } from '@/lib/hunter/classes';

export const hunterReadHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
};

export const hunterReadFailure = (code: string, status: number) =>
  NextResponse.json({ code }, { status, headers: hunterReadHeaders });

const safeCodes: Record<string, { status: number; code: string }> = {
  SESSION_EXPIRED: { status: 401, code: 'SESSION_EXPIRED' },
  ACTOR_MISMATCH: { status: 403, code: 'ACTOR_MISMATCH' },
  ACCOUNT_MISSING: { status: 409, code: 'ACCOUNT_MISSING' },
  SNAPSHOT_INCONSISTENT: { status: 409, code: 'SNAPSHOT_INCONSISTENT' },
  MODULE_INVALID: { status: 409, code: 'MODULE_INVALID' },
  UNSUPPORTED_NUMBER: { status: 409, code: 'UNSUPPORTED_NUMBER' },
  SNAPSHOT_TOO_LARGE: { status: 413, code: 'SNAPSHOT_TOO_LARGE' },
  VALIDATION_FAILED: { status: 400, code: 'VALIDATION_FAILED' },
};

const revision = (value: unknown) => typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value);
const decimal = (value: unknown) => typeof value === 'string' && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function validSnapshot(value: unknown, actor: string): boolean {
  if (!record(value) || value.schemaVersion !== 1 || value.actor !== actor || !revision(value.revision)) return false;
  if (value.state !== 'ready') {
    return ['setup_pending', 'migration_pending', 'recovery_required', 'onboarding_pending'].includes(String(value.state))
      && typeof value.reason === 'string';
  }
  if (!record(value.data) || !record(value.data.system) || !record(value.data.extra)
    || !record(value.data.lab) || !record(value.data.settings) || !record(value.data.profile)
    || !record(value.exactXP) || !record(value.derived) || !record(value.entityRevisions)) return false;
  if (![value.exactXP.total, value.exactXP.opening, value.exactXP.roundoff].every(decimal)) return false;
  const arrays = [
    value.data.system.quests, value.data.system.arcs, value.data.system.completions, value.data.system.achievements,
    value.data.extra.bosses, value.data.extra.events,
    value.data.lab.ideas, value.data.lab.nodes, value.data.lab.resources, value.data.lab.journal,
    value.data.lab.sessions, value.data.lab.challenges,
  ];
  return arrays.every(Array.isArray) && decimal(value.data.system.totalXP)
    && (value.data.profile.classCode === null || isHunterClassCode(value.data.profile.classCode))
    && revision(value.data.profile.revision)
    && decimal(value.data.settings.baselineXP) && revision(value.data.settings.revision)
    && value.data.timer !== undefined && (value.data.timer === null || record(value.data.timer));
}

function validReceipt(value: unknown, actor: string): boolean {
  if (!record(value) || value.actor !== actor) return false;
  if (value.state === 'not_found') return typeof value.requestId === 'string';
  if (value.state !== 'found' || !record(value.receipt)) return false;
  return typeof value.receipt.requestId === 'string' && typeof value.receipt.commandKind === 'string'
    && revision(value.receipt.committedRevision) && record(value.receipt.minimalResult);
}

export async function readHunterRpc<T>(name: string, args: Record<string, string>) {
  let session;
  try {
    session = await verifiedSession(false);
  } catch {
    return hunterReadFailure('AUTH_UNAVAILABLE', 503);
  }
  if (!session) return hunterReadFailure('AUTH_REQUIRED', 401);

  const { data, error } = await session.client.rpc(name, {
    ...args,
    expected_actor: session.user.id,
  });
  if (error) {
    const known = safeCodes[error.message];
    if (known) return hunterReadFailure(known.code, known.status);
    if (error.code === '42501') return hunterReadFailure('AUTH_REQUIRED', 401);
    return hunterReadFailure('SNAPSHOT_UNAVAILABLE', 503);
  }
  const valid = name === 'lifequest_hunter_snapshot'
    ? validSnapshot(data, session.user.id)
    : name === 'lifequest_command_receipt' ? validReceipt(data, session.user.id) : false;
  if (!valid) return hunterReadFailure('SNAPSHOT_INCONSISTENT', 503);
  return NextResponse.json(data as T, { headers: hunterReadHeaders });
}
