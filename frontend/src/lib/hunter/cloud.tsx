'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { HunterClassCode } from '@/lib/hunter/classes';

export type HunterRow = Record<string, unknown>;
export type HunterSnapshot = {
  schemaVersion: 1; actor: string; revision: string; state: 'ready' | 'setup_pending' | 'migration_pending' | 'recovery_required' | 'onboarding_pending';
  reason?: string; serverTime?: string; timezone?: string;
  data?: { profile: HunterRow & { classCode: HunterClassCode | null; revision: string }; system: HunterRow & { quests: HunterRow[]; arcs: HunterRow[]; completions: HunterRow[]; achievements: HunterRow[]; totalXP: string };
    extra: HunterRow & { bosses: HunterRow[]; events: HunterRow[] };
    lab: HunterRow & { ideas: HunterRow[]; nodes: HunterRow[]; resources: HunterRow[]; journal: HunterRow[]; sessions: HunterRow[]; challenges: HunterRow[] };
    settings: HunterRow; timer: HunterRow | null };
  exactXP?: { total: string; opening: string; roundoff: string };
  derived?: { progress: HunterRow; rank: string; attributeXP: Record<string, string>; achievements: string[] };
  entityRevisions?: HunterRow;
};

type CommandResult = { requestId: string; revision?: string; changed?: boolean; domains?: string[]; result?: HunterRow };
type CloudContext = {
  actor: string; snapshot: HunterSnapshot; loading: boolean; error: string; notice: string;
  hasUncertainCommand: boolean; refresh: () => Promise<void>; retryCommand: () => Promise<CommandResult | null>;
  logout: () => Promise<void>; command: (kind: string, payload: HunterRow) => Promise<CommandResult | null>;
};
const Context = createContext<CloudContext | null>(null);
const safeError: Record<string, string> = {
  AUTH_REQUIRED: 'La session n’est plus valide. Reconnectez-vous.', AUTH_UNAVAILABLE: 'La vérification de session est momentanément indisponible.',
  CALENDAR_NOT_ACTIVE: 'Les crédits sont suspendus car le calendrier de cette cible n’est pas activé.',
  CALENDAR_MISMATCH: 'Les crédits sont suspendus car le calendrier ne correspond plus aux contrôles validés.',
  CALENDAR_UNVERIFIED: 'Les crédits sont suspendus car le calendrier de cette cible n’a pas été validé.',
  COMMAND_UNAVAILABLE: 'La commande n’a pas pu être confirmée. Vérifiez son reçu avant de réessayer.',
  COMMAND_RESULT_INVALID: 'Le serveur a renvoyé un résultat incohérent.', REVISION_CONFLICT: 'Cette donnée a changé ailleurs. Les données ont été rechargées.',
  MIND_MAP_SOURCE_IN_USE: 'Ce nœud Mind Map est conservé comme source d’un Boss existant.',
  SOURCE_ALREADY_CONVERTED: 'Cette branche Mind Map est déjà associée à un Boss.',
  NOT_DUE: 'Cette action n’est pas disponible pour le moment.', NOT_FOUND: 'Cette donnée n’est plus disponible.',
  VALIDATION_FAILED: 'Les informations saisies ne sont pas valides.', FOCUS_STATE_INVALID: 'Cet état de session Focus ne permet pas cette action.',
  FOCUS_DURATION_UNVERIFIED: 'La durée doit être vérifiée par le serveur avant de terminer la session.',
  HISTORICAL_FOCUS_UNVERIFIED: 'Cette session historique ne peut pas recevoir de crédit automatiquement.',
  FOCUS_TARGET_UNAVAILABLE: 'Cet objectif n’est plus disponible. Actualisez le snapshot et choisissez une cible encore active.',
};

export function HunterCloudProvider({ actor, initial, children }: { actor: string; initial: HunterSnapshot; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<number | null>(null);
  const [hasUncertainCommand, setHasUncertainCommand] = useState(false);
  const epoch = useRef(0);
  const actorRef = useRef(actor);
  const requests = useRef(new Map<string, string>());
  const uncertainCommand = useRef<{ actor: string; kind: string; payload: HunterRow; intent: string } | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const announce = useCallback((message: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = window.setTimeout(() => { setNotice(''); noticeTimer.current = null; }, 2400);
  }, []);

  const refresh = useCallback(async () => {
    const current = ++epoch.current; actorRef.current = actor;
    inFlight.current?.abort(); const controller = new AbortController(); inFlight.current = controller;
    setLoading(true);
    try {
      const response = await fetch('/api/hunter/bootstrap', { cache: 'no-store', signal: controller.signal });
      if (response.status === 401) { window.location.replace('/login'); return; }
      const value: unknown = await response.json();
      if (!response.ok || !value || typeof value !== 'object' || !('actor' in value)) throw new Error('SNAPSHOT_UNAVAILABLE');
      if (value.actor !== actor) { setSnapshot({ ...initial, actor: '' }); window.location.replace('/auth/loading'); return; }
      if (!('state' in value) || value.state !== 'ready') { setSnapshot({ ...initial, actor: '' }); window.location.reload(); return; }
      if (current === epoch.current && actorRef.current === actor) { setSnapshot(value as HunterSnapshot); setError(''); }
    } catch {
      if (current === epoch.current && !controller.signal.aborted) { setSnapshot({ ...initial, actor: '' }); setError('La progression cloud est indisponible. Aucune donnée locale ne sera utilisée. Réessayez.'); }
    } finally { if (current === epoch.current) setLoading(false); }
  }, [actor, initial]);

  const reconcile = useCallback(async (requestId: string, signal?: AbortSignal) => {
    const response = await fetch(`/api/hunter/receipts/${encodeURIComponent(requestId)}`, { cache: 'no-store', signal });
    if (!response.ok) return 'unknown' as const;
    const value = await response.json() as { state?: string };
    return value.state === 'found' ? 'found' as const : value.state === 'not_found' ? 'not_found' as const : 'unknown' as const;
  }, []);

  const command = useCallback(async (kind: string, payload: HunterRow) => {
    if (actorRef.current !== actor || snapshot.actor !== actor || snapshot.state !== 'ready') return null;
    const intent = JSON.stringify([actor, kind, payload]);
    let requestId = requests.current.get(intent);
    if (!requestId) { requestId = crypto.randomUUID(); requests.current.set(intent, requestId); }
    setError(''); setNotice('');
    const controller = new AbortController(); inFlight.current?.abort(); inFlight.current = controller;
    try {
      const response = await fetch('/api/hunter/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, payload, requestId }), cache: 'no-store', signal: controller.signal });
      const value = await response.json() as CommandResult & { code?: string };
      if (!response.ok) {
        if (response.status >= 500) {
          const status = await reconcile(requestId);
          if (status === 'found') { requests.current.delete(intent); uncertainCommand.current = null; setHasUncertainCommand(false); await refresh(); announce('Commande confirmée par son reçu.'); return { requestId }; }
          uncertainCommand.current = { actor, kind, payload, intent };
          setHasUncertainCommand(true);
          setError('Résultat de commande inconnu. Réessayez cette même action pour réconcilier son reçu.');
          return null;
        }
        uncertainCommand.current = null;
        setHasUncertainCommand(false);
        const message = safeError[value.code || ''] || 'La commande a été refusée.';
        setError(message);
        if (value.code === 'REVISION_CONFLICT' || value.code === 'FOCUS_TARGET_UNAVAILABLE') { await refresh(); setError(message); }
        return null;
      }
      requests.current.delete(intent); uncertainCommand.current = null; setHasUncertainCommand(false);
      await refresh();
      announce('Enregistrement confirmé.');
      return value;
    } catch {
      if (!controller.signal.aborted) {
        const status = await reconcile(requestId).catch(() => 'unknown' as const);
        if (status === 'found') { requests.current.delete(intent); uncertainCommand.current = null; setHasUncertainCommand(false); await refresh(); announce('Commande confirmée par son reçu.'); return { requestId }; }
        uncertainCommand.current = { actor, kind, payload, intent };
        setHasUncertainCommand(true);
        setError('Résultat de commande inconnu. Réessayez cette même action pour réconcilier son reçu.');
      }
      return null;
    }
  }, [actor, announce, reconcile, refresh, snapshot]);

  const retryCommand = useCallback(() => {
    const pending = uncertainCommand.current;
    if (!pending || pending.actor !== actor || actorRef.current !== actor) return Promise.resolve(null);
    return command(pending.kind, pending.payload);
  }, [actor, command]);

  useEffect(() => {
    actorRef.current = actor;
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const channel = new BroadcastChannel('lifequest-auth');
    const changed = (event: MessageEvent) => {
      if (event.data === 'locking' || event.data === 'logout-failed') {
        ++epoch.current; inFlight.current?.abort(); requests.current.clear(); uncertainCommand.current = null; setHasUncertainCommand(false); setSnapshot({ ...initial, actor: '' }); setError(''); setNotice('');
      } else if (event.data === 'changed') { ++epoch.current; inFlight.current?.abort(); requests.current.clear(); uncertainCommand.current = null; setHasUncertainCommand(false); window.location.reload(); }
    };
    channel.addEventListener('message', changed);
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onFocus);
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => { clearTimeout(initialRefresh); inFlight.current?.abort(); channel.removeEventListener('message', changed); channel.close(); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); clearInterval(timer); if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current); };
  }, [actor, initial, refresh]);

  const logout = useCallback(async () => {
    uncertainCommand.current = null;
    setHasUncertainCommand(false);
    const channel = new BroadcastChannel('lifequest-auth'); channel.postMessage('locking'); channel.close();
    document.cookie = 'lifequest-access-locked=1; Path=/; SameSite=Strict' + (location.protocol === 'https:' ? '; Secure' : '');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store' });
      if (!response.ok) throw new Error('LOGOUT_FAILED');
      location.replace('/login');
    } catch { setError('La déconnexion n’a pas été confirmée. L’espace reste masqué ; réessayez la déconnexion.'); }
  }, []);
  const value = useMemo(() => ({ actor, snapshot, loading, error, notice, hasUncertainCommand, refresh, retryCommand, logout, command }), [actor, snapshot, loading, error, notice, hasUncertainCommand, refresh, retryCommand, logout, command]);
  if (snapshot.actor !== actor) return <main aria-busy={!error}><p role={error ? 'alert' : 'status'}>{error || 'Vérification de la nouvelle session…'}</p>{error && <button onClick={() => void refresh()}>Réessayer</button>}<button onClick={() => void logout()}>Se déconnecter</button></main>;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useHunterCloud() {
  const value = useContext(Context);
  if (!value) throw new Error('HunterCloudProvider is required for protected Hunter routes');
  return value;
}

export function hunterNumber(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= Number.MAX_SAFE_INTEGER ? number : null;
}
export function hunterText(value: unknown): string { return typeof value === 'string' ? value : ''; }
export function hunterRows(value: unknown): HunterRow[] { return Array.isArray(value) ? value.filter((row): row is HunterRow => typeof row === 'object' && row !== null && !Array.isArray(row)) : []; }
