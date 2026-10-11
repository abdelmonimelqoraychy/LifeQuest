export type HunterRank = "E" | "D" | "C" | "B" | "A" | "S";
export function rankForLevel(level: number): HunterRank {
  return level >= 50 ? "S" : level >= 40 ? "A" : level >= 30 ? "B" : level >= 20 ? "C" : level >= 10 ? "D" : "E";
}
export type BossMission = { id: string; title: string; objective: string; target: number; current: number; xp: number; createdAt: string; completedAt?: string };
export type HunterEvent = { id: string; kind: "boss" | "rank" | "evolution"; title: string; at: string; detail?: string };
export type ExtraState = { version: 1; bosses: BossMission[]; events: HunterEvent[] };
export const EXTRA_KEY = "lifequest-hunter-operations-v1";
export const extraDefault = (): ExtraState => ({ version: 1, bosses: [], events: [] });
export function loadExtra(): ExtraState {
  const raw = localStorage.getItem(EXTRA_KEY);
  if (!raw) return extraDefault();
  const input: unknown = JSON.parse(raw);
  if (!input || typeof input !== "object") throw Error("Sauvegarde Hunter Operations illisible; aucune modification.");
  const x = input as Partial<ExtraState>;
  if (x.version !== 1 || !Array.isArray(x.bosses) || !Array.isArray(x.events)) throw Error("Format Hunter Operations inconnu; aucune modification.");
  return { version: 1, bosses: x.bosses, events: x.events };
}
export function saveExtra(state: ExtraState) { localStorage.setItem(EXTRA_KEY, JSON.stringify(state)); }
export function hunterEvent(kind: HunterEvent["kind"], title: string, detail?: string): HunterEvent {
  return { id: crypto.randomUUID(), kind, title, detail, at: new Date().toISOString() };
}
export const RANKS: HunterRank[] = ["E", "D", "C", "B", "A", "S"];
