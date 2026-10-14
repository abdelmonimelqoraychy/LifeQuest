import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

const name = 'lifequest-recovery';
function key() {
  const value = process.env.AUTH_RECOVERY_SECRET;
  if (!value || value.length < 64) throw new Error('RECOVERY_CONFIGURATION_REQUIRED');
  return value;
}
function sign(payload: string) { return createHmac('sha256', key()).update(payload).digest('base64url'); }
export async function grantRecovery(actor: string, session: string) {
  const payload = Buffer.from(JSON.stringify({ actor, session, expires: Date.now() + 600_000 })).toString('base64url');
  (await cookies()).set(name, payload + '.' + sign(payload), {
    httpOnly: true, secure: process.env.APP_ORIGIN?.startsWith('https://'), sameSite: 'strict', path: '/', maxAge: 600,
  });
}
export async function recoveryAllowed(actor: string, session: string) {
  const value = (await cookies()).get(name)?.value;
  if (!value || value.length > 1024) return false;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return false;
  const expected = Buffer.from(sign(payload)); const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  try {
    const proof = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return proof.actor === actor && proof.session === session && proof.expires > Date.now() && proof.expires <= Date.now() + 600_000;
  } catch { return false; }
}
export async function clearRecovery() { (await cookies()).delete(name); }
