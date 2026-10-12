import 'server-only';
export function appOrigin() {
  const value = process.env.APP_ORIGIN;
  if (!value) throw new Error('APP_ORIGIN_REQUIRED');
  const url = new URL(value);
  if (url.origin !== value || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) throw new Error('APP_ORIGIN_INVALID');
  return value;
}
export async function authBody(request: Request) {
  if (request.headers.get('origin') !== appOrigin() || request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw new Error('REQUEST_REFUSED');
  if (Number(request.headers.get('content-length') || 0) > 4096) throw new Error('REQUEST_REFUSED');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('REQUEST_REFUSED');
  let bytes = 0; const parts: Uint8Array[] = [];
  while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 4096) { await reader.cancel(); throw new Error('REQUEST_REFUSED'); } parts.push(chunk.value); }
  let body;
  try { body = JSON.parse(Buffer.concat(parts).toString()); } catch { throw new Error('REQUEST_REFUSED'); }
  if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('REQUEST_REFUSED');
  return body as Record<string, unknown>;
}
export function passwordValid(value: unknown): value is string { return typeof value === 'string' && value.length >= 12 && value.length <= 128; }
export function emailValid(value: unknown): value is string { return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
