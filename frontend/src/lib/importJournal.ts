import { isRecord, timestamp } from '@/lib/validation';

export const IMPORT_JOURNAL_KEY = 'lifequest-import-journal-v1';
export const IMPORT_RECORD_KEYS = [
  'lifequest-quest-system-v1', 'lifequest-hunter-lab-v1', 'lifequest-hunter-operations-v1',
  'lifequest-core-v011', 'lifequest-hunter-timer-v1', 'lifequest-profile-v1',
  'lifequest-v2-demo', 'lifequest-hunter-transition-v1',
] as const;
export const MAX_JOURNAL_KEYS = 256;
export type JournalStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type JournalSnapshot = Readonly<Record<string, string | null>>;
export type ImportJournal = {
  readonly format: 'lifequest-import-journal'; readonly version: 1;
  readonly operationId: string; readonly createdAt: string;
  readonly phase: 'prepared' | 'committed'; readonly keys: readonly string[];
  readonly before: JournalSnapshot; readonly after: JournalSnapshot;
};
export type JournalRead =
  | { status: 'absent' }
  | { status: 'valid'; journal: ImportJournal }
  | { status: 'corrupt' | 'unknown'; raw: string; message: string }
  | { status: 'unavailable'; message: string };
export type JournalValues = {
  status: 'unchanged' | 'before' | 'after' | 'mixed' | 'ambiguous' | 'unavailable';
  matchesBefore: boolean; matchesAfter: boolean;
  conflicts: string[]; message: string;
};

export function isAllowedImportKey(key: string) {
  return (IMPORT_RECORD_KEYS as readonly string[]).includes(key)
    || /^lifequest-cinematic-seen-v1:[^:]+:(5|10|20)$/.test(key);
}
function validKeys(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_JOURNAL_KEYS
    && value.every(k => typeof k === 'string' && isAllowedImportKey(k))
    && new Set(value).size === value.length
    && IMPORT_RECORD_KEYS.every(k => value.includes(k));
}
function validSnapshot(value: unknown, keys: readonly string[]): value is JournalSnapshot {
  return isRecord(value) && Object.keys(value).length === keys.length
    && keys.every(k => Object.hasOwn(value, k) && (value[k] === null || typeof value[k] === 'string'));
}
/** Structural validation only. Phase B must validate the target backup with F03/F04. */
export function validImportJournal(value: unknown): value is ImportJournal {
  if (!isRecord(value)) return false;
  const fields = ['format', 'version', 'operationId', 'createdAt', 'phase', 'keys', 'before', 'after'];
  return Object.keys(value).length === fields.length && fields.every(k => Object.hasOwn(value, k))
    && value.format === 'lifequest-import-journal' && value.version === 1
    && typeof value.operationId === 'string' && !!value.operationId.trim() && value.operationId.length <= 128
    && timestamp(value.createdAt) && (value.phase === 'prepared' || value.phase === 'committed')
    && validKeys(value.keys) && validSnapshot(value.before, value.keys) && validSnapshot(value.after, value.keys);
}
function requireValid(journal: ImportJournal) {
  if (!validImportJournal(journal)) throw Error('Journal d’import invalide. Aucune modification.');
}
/** Pure creation, with copied raw snapshots: even corrupt historical JSON remains intact. */
export function createImportJournal(before: JournalSnapshot, after: JournalSnapshot,
  operationId: string, createdAt = new Date().toISOString()): ImportJournal {
  const journal: ImportJournal = {
    format: 'lifequest-import-journal', version: 1, operationId, createdAt, phase: 'prepared',
    keys: Object.keys(before).sort(), before: { ...before }, after: { ...after },
  };
  requireValid(journal);
  return journal;
}
export function captureJournalSnapshot(storage: JournalStorage, keys: readonly string[]): JournalSnapshot {
  if (!validKeys(keys)) throw Error('Clés du journal invalides. Aucune modification.');
  try { return Object.fromEntries(keys.map(k => [k, storage.getItem(k)])); }
  catch (cause) { throw Error('Stockage indisponible : instantané impossible.', { cause }); }
}
/** Reading never repairs, deletes or initializes data. Keep corrupt/unknown raw evidence. */
export function readImportJournal(storage: JournalStorage): JournalRead {
  let raw: string | null;
  try { raw = storage.getItem(IMPORT_JOURNAL_KEY); }
  catch { return { status: 'unavailable', message: 'Stockage indisponible : journal inaccessible.' }; }
  if (raw === null) return { status: 'absent' };
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { return { status: 'corrupt', raw, message: 'Journal illisible. Données conservées.' }; }
  if (isRecord(value) && (value.version !== 1 || value.format !== 'lifequest-import-journal'))
    return { status: 'unknown', raw, message: 'Format ou version du journal inconnu. Données conservées.' };
  if (!validImportJournal(value)) return { status: 'corrupt', raw, message: 'Journal invalide. Données conservées.' };
  return { status: 'valid', journal: value };
}
/** Raw byte equality, including null (missing key) versus an empty string. */
export function inspectJournalValues(journal: ImportJournal, storage: JournalStorage): JournalValues {
  requireValid(journal);
  let current: JournalSnapshot;
  try { current = captureJournalSnapshot(storage, journal.keys); }
  catch { return { status: 'unavailable', matchesBefore: false, matchesAfter: false,
    conflicts: [], message: 'Stockage indisponible : vérification impossible.' }; }
  const matchesBefore = journal.keys.every(k => current[k] === journal.before[k]);
  const matchesAfter = journal.keys.every(k => current[k] === journal.after[k]);
  const conflicts = journal.keys.filter(k => current[k] !== journal.before[k] && current[k] !== journal.after[k]);
  // A committed record is contradictory unless its whole target is present.
  if (journal.phase === 'committed' && !matchesAfter)
    for (const k of journal.keys) if (current[k] !== journal.after[k] && !conflicts.includes(k)) conflicts.push(k);
  const status = conflicts.length ? 'ambiguous' : matchesBefore && matchesAfter ? 'unchanged'
    : matchesBefore ? 'before' : matchesAfter ? 'after' : 'mixed';
  return { status, matchesBefore, matchesAfter, conflicts,
    message: status === 'ambiguous' ? 'État ambigu : aucune réparation automatique.' : 'Valeurs brutes vérifiées : ' + status + '.' };
}
function requireStored(expected: ImportJournal, storage: JournalStorage) {
  requireValid(expected);
  const read = readImportJournal(storage);
  if (read.status !== 'valid') throw Error(read.status === 'absent' ? 'Journal absent. Aucune modification.' : read.message);
  // Do not overwrite another operation, a changed snapshot, or an unexpected phase.
  if (JSON.stringify(read.journal) !== JSON.stringify(expected))
    throw Error('Le journal a changé. Aucune modification.');
}
function writeVerified(journal: ImportJournal, storage: JournalStorage) {
  const raw = JSON.stringify(journal);
  try {
    storage.setItem(IMPORT_JOURNAL_KEY, raw);
    if (storage.getItem(IMPORT_JOURNAL_KEY) !== raw) throw Error('Lecture de contrôle différente');
  } catch (cause) {
    // Never delete evidence after an uncertain write or attempt a business-data rollback here.
    throw Error('Écriture du journal non confirmée (quota ou stockage indisponible). Journal éventuellement présent à vérifier.', { cause });
  }
}
/** Phase A primitives: the caller must hold lifequest-storage for the whole operation.
 * No lock acquisition here (Phase B already holds it); no business-key writes or automatic recovery.
 */
export function prepareImportJournal(journal: ImportJournal, storage: JournalStorage): ImportJournal {
  requireValid(journal);
  if (journal.phase !== 'prepared') throw Error('Un nouveau journal doit être prepared.');
  const read = readImportJournal(storage);
  if (read.status !== 'absent') throw Error(read.status === 'valid' ? 'Un journal existe déjà. Aucune modification.' : read.message);
  const state = inspectJournalValues(journal, storage);
  if (!state.matchesBefore) throw Error('Instantané initial non confirmé. ' + state.message);
  writeVerified(journal, storage);
  return journal;
}
export function markImportJournalCommitted(expected: ImportJournal, storage: JournalStorage): ImportJournal {
  requireStored(expected, storage);
  const state = inspectJournalValues(expected, storage);
  if (!state.matchesAfter) throw Error('Import incomplet ou non vérifiable. ' + state.message);
  if (expected.phase === 'committed') return expected;
  const committed: ImportJournal = { ...expected, phase: 'committed' };
  writeVerified(committed, storage);
  return committed;
}
/** Explicit cleanup only after a verified commit OR verified rollback to before. */
export function clearImportJournal(expected: ImportJournal, storage: JournalStorage) {
  requireStored(expected, storage);
  const state = inspectJournalValues(expected, storage);
  const finished = expected.phase === 'committed' ? state.matchesAfter : state.matchesBefore;
  if (!finished || state.status === 'ambiguous') throw Error('Journal conservé : opération non terminée. ' + state.message);
  try {
    storage.removeItem(IMPORT_JOURNAL_KEY);
    if (storage.getItem(IMPORT_JOURNAL_KEY) !== null) throw Error('Suppression non confirmée');
  } catch (cause) { throw Error('Nettoyage du journal non confirmé. Vérifie son état avant toute reprise.', { cause }); }
}
