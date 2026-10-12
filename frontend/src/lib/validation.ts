/** Runtime validation for untrusted saves. */
export const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export const text = (v: unknown): v is string => typeof v === 'string';
export const id = (v: unknown): v is string => text(v) && v.length > 0;
export const nonNegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
export const timestamp = (v: unknown): v is string => text(v) && /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(v) && calendarDate(v.slice(0,10)) && Number.isFinite(Date.parse(v));
export function calendarDate(v: unknown): v is string {
    if (!text(v) || !/^\d{4}-\d{2}-\d{2}$/.test(v))
        return false;
    const d = new Date(v + 'T12:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
export function uniqueIds(items: {
    id: string;
}[]) { return new Set(items.map(x => x.id)).size === items.length; }
export function safeResourceUrl(v: unknown): v is string {
    if (!text(v))
        return false;
    if (v === '')
        return true;
    try {
        const u = new URL(v);
        return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password;
    }
    catch {
        return false;
    }
}
