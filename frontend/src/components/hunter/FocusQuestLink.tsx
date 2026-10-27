'use client';

import { useRef, useState } from 'react';
import { Clock3, Pause, Play, RotateCcw } from 'lucide-react';
import type { HunterRow } from '@/lib/hunter/cloud';
import {
  buildFocusTarget,
  eligibleFocusBossSteps,
  eligibleFocusQuests,
  formatMeasuredFocusMs,
  parseMeasuredFocusMs,
} from '@/lib/hunter/focusQuestLink';
import styles from './FocusQuestLink.module.css';

type Props = {
  timer: HunterRow | null;
  sessions: HunterRow[];
  quests: HunterRow[];
  bosses: HunterRow[];
  error: string;
  hasUncertainCommand: boolean;
  revision: (row: HunterRow) => string;
  onCommand: (kind: string, payload: HunterRow) => Promise<unknown>;
  onRetry: () => Promise<unknown>;
};

type GoalKind = 'free' | 'quest' | 'boss_subobjective';
const field = (row: HunterRow | null | undefined, key: string): string => typeof row?.[key] === 'string' ? row[key] as string : '';
const rowForResult = (value: unknown): HunterRow | null => {
  if (typeof value !== 'object' || value === null || !('result' in value)) return null;
  const result = (value as { result?: unknown }).result;
  return typeof result === 'object' && result !== null && !Array.isArray(result) ? result as HunterRow : null;
};

export default function FocusQuestLink({ timer, sessions, quests, bosses, error, hasUncertainCommand, revision, onCommand, onRetry }: Props) {
  const [mode, setMode] = useState('focus');
  const [label, setLabel] = useState('Deep Work');
  const [goalKind, setGoalKind] = useState<GoalKind>('free');
  const [selectedId, setSelectedId] = useState('');
  const [localBusy, setLocalBusy] = useState(false);
  const [completion, setCompletion] = useState<{ label: string; activeMs: number | null } | null>(null);
  const submitLock = useRef(false);
  const status = field(timer, 'status');
  const timerMode = field(timer, 'mode') || mode;
  const timerId = field(timer, 'id');
  const targetKind = field(timer, 'targetKind');
  const targetId = targetKind === 'quest' ? field(timer, 'questId')
    : targetKind === 'boss_subobjective' ? `${field(timer, 'bossId')}:${field(timer, 'subobjectiveId')}` : '';
  const targetLabel = field(timer, 'targetLabelSnapshot');
  const locked = status === 'running' || status === 'paused';
  const canChooseTarget = !locked;
  const choiceKind: GoalKind = locked ? targetKind === 'quest' ? 'quest' : targetKind === 'boss_subobjective' ? 'boss_subobjective' : 'free' : goalKind;
  const choiceId = locked ? targetId : selectedId;
  const timerLabel = field(timer, 'label');
  const labelValue = timer && status === 'idle' && label === 'Deep Work' ? timerLabel || label : locked ? timerLabel || label : label;
  const questOptions = eligibleFocusQuests(quests);
  const bossSteps = eligibleFocusBossSteps(bosses);

  const submit = async (kind: string, payload: HunterRow) => {
    if (submitLock.current) return null;
    submitLock.current = true;
    setLocalBusy(true);
    try { return await onCommand(kind, payload); }
    finally { submitLock.current = false; setLocalBusy(false); }
  };
  const retry = async () => {
    if (submitLock.current) return;
    submitLock.current = true;
    setLocalBusy(true);
    try { await onRetry(); }
    finally { submitLock.current = false; setLocalBusy(false); }
  };

  const start = async () => {
    const target = timerMode === 'focus' ? buildFocusTarget(choiceKind, choiceId, questOptions, bossSteps) : null;
    if (timerMode === 'focus' && choiceKind !== 'free' && !target) return;
    const payload: HunterRow = { mode: timerMode, label: labelValue.trim() || 'Deep Work' };
    if (target) payload.target = target as unknown as HunterRow;
    await submit('focus.start', payload);
  };

  const finish = async () => {
    if (!timer) return;
    const result = await submit('focus.finish', { id: field(timer, 'id'), expectedRevision: field(timer, 'revision') || '0' });
    const detail = rowForResult(result);
    if (!detail || detail.activeMs === undefined) return;
    setCompletion({ label: field(detail, 'targetLabelSnapshot') || 'Session libre', activeMs: parseMeasuredFocusMs(detail.activeMs) });
  };

  const latestSessions = sessions.slice().sort((left, right) => field(right, 'date').localeCompare(field(left, 'date'))).slice(0, 8);
  const hasSelection = choiceKind === 'free' || (choiceKind === 'quest' ? questOptions.some(item => item.id === choiceId) : bossSteps.some(item => `${item.bossId}:${item.id}` === choiceId));
  const canStart = !localBusy && !hasUncertainCommand && (timerMode !== 'focus' || hasSelection);

  return <section className={styles.root} aria-labelledby="focus-quest-link-title">
    <header className={styles.heading}>
      <span className={styles.icon}><Clock3 size={20} aria-hidden="true"/></span>
      <div><h3 id="focus-quest-link-title">FOCUS QUEST LINK</h3><p>Associez votre concentration à un objectif. Il ne sera jamais validé automatiquement.</p></div>
    </header>

    <div className={styles.setup}>
      <div className={styles.goalPanel}>
        <label className={styles.field}>OBJECTIF DE LA SESSION
          <select value={choiceKind} onChange={event => { setGoalKind(event.target.value as GoalKind); setSelectedId(''); }} disabled={!canChooseTarget || timerMode !== 'focus'}>
            <option value="free">Session libre</option>
            <option value="quest">Quête</option>
            <option value="boss_subobjective">Étape de Boss</option>
          </select>
        </label>
        {timerMode === 'focus' && choiceKind === 'quest' && <label className={styles.field}>QUÊTE ACTIVE
          <select value={choiceId} onChange={event => setSelectedId(event.target.value)} disabled={!canChooseTarget}>
            <option value="">Choisir une quête</option>
            {questOptions.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}
            {locked && targetKind === 'quest' && !questOptions.some(option => option.id === targetId) && <option value={targetId}>{targetLabel || 'Objectif lié à cette session'}</option>}
          </select>
        </label>}
        {timerMode === 'focus' && choiceKind === 'boss_subobjective' && <label className={styles.field}>ÉTAPE INACHEVÉE
          <select value={choiceId} onChange={event => setSelectedId(event.target.value)} disabled={!canChooseTarget}>
            <option value="">Choisir une étape</option>
            {bossSteps.map(option => <option key={`${option.bossId}:${option.id}`} value={`${option.bossId}:${option.id}`}>{option.label}</option>)}
            {locked && targetKind === 'boss_subobjective' && !bossSteps.some(option => `${option.bossId}:${option.id}` === targetId) && <option value={targetId}>{targetLabel || 'Objectif lié à cette session'}</option>}
          </select>
        </label>}
        {timerMode === 'focus' && choiceKind === 'quest' && !questOptions.length && <p className={styles.empty}>Aucune quête active dans le snapshot. Vous pouvez choisir une session libre.</p>}
        {timerMode === 'focus' && choiceKind === 'boss_subobjective' && !bossSteps.length && <p className={styles.empty}>Aucune étape de Boss inachevée dans le snapshot. Vous pouvez choisir une session libre.</p>}
        {timerMode !== 'focus' && <p className={styles.empty}>Les pauses restent libres et ne sont pas associées à un objectif.</p>}
        {locked && <p className={styles.lockedTarget}>Objectif conservé par PostgreSQL : <strong>{targetLabel || 'Session libre'}</strong></p>}
      </div>

      <div className={styles.timerPanel}>
        <div className={styles.modes} aria-label="Mode Focus">
          {([['focus', 'FOCUS · 25 MIN'], ['short', 'PAUSE · 5 MIN'], ['long', 'PAUSE LONGUE · 15 MIN']] as const).map(([value, title]) =>
            <button type="button" key={value} aria-pressed={timerMode === value} disabled={Boolean(timer) || localBusy} onClick={() => setMode(value)}>{title}</button>)}
        </div>
        <div className={styles.clock} aria-live="polite">{timer ? `${String(Math.floor(Number(timer.remainingSeconds || 0) / 60)).padStart(2, '0')}:${String(Number(timer.remainingSeconds || 0) % 60).padStart(2, '0')}` : '25:00'}</div>
        <label className={styles.field}>NOM DE SESSION
          <input value={labelValue} onChange={event => setLabel(event.target.value)} maxLength={80} disabled={locked || localBusy}/>
        </label>
        {status === 'idle' && <p className={styles.empty}>Le serveur reprendra ce run et figera la cible choisie au démarrage.</p>}
        <div className={styles.actions}>
          {!locked ? <button type="button" className={styles.primary} onClick={() => void start()} disabled={!canStart}><Play size={17} aria-hidden="true"/> DÉMARRER</button> : <>
            <button type="button" className={styles.primary} onClick={() => void submit(status === 'running' ? 'focus.pause' : 'focus.resume', { id: timerId, expectedRevision: field(timer, 'revision') || '0' })} disabled={localBusy || hasUncertainCommand}>{status === 'running' ? <><Pause size={17} aria-hidden="true"/> PAUSE</> : 'REPRENDRE'}</button>
            <button type="button" className={styles.secondary} onClick={() => void submit('focus.cancel', { id: timerId, expectedRevision: field(timer, 'revision') || '0' })} disabled={localBusy || hasUncertainCommand}><RotateCcw size={16} aria-hidden="true"/> ANNULER</button>
            <button type="button" className={styles.primary} onClick={() => void finish()} disabled={localBusy || hasUncertainCommand}>TERMINER</button>
          </>}
        </div>
        <p className={styles.note}>Le temps est mesuré côté PostgreSQL. Une session Focus complète conserve la récompense habituelle de 20 EXP ; le lien ne donne aucun EXP supplémentaire et ne termine pas l’objectif.</p>
      </div>
    </div>

    {error && <div role="alert" className={styles.error}>{error}</div>}
        {hasUncertainCommand && <div className={styles.retry}><p>Le résultat de la dernière commande est inconnu. Réessayez la même intention pour vérifier son reçu.</p><button type="button" className={styles.secondary} onClick={() => void retry()} disabled={localBusy}>RÉESSAYER LA MÊME ACTION</button></div>}
    {completion && <div className={styles.complete} role="status" aria-live="polite"><strong>SESSION TERMINÉE</strong><span>{completion.label}</span><b>{completion.activeMs === null ? 'Durée réelle non fournie par le reçu' : formatMeasuredFocusMs(completion.activeMs)} de concentration mesurée</b><small>L’objectif reste dans son état actuel ; aucune validation automatique n’a été faite.</small></div>}

    <div className={styles.history}>
      <h4>DERNIÈRES SESSIONS FOCUS</h4>
      {latestSessions.length === 0 && <p className={styles.empty}>Aucune session Focus terminée enregistrée.</p>}
      {latestSessions.map(session => {
        const measured = parseMeasuredFocusMs(session.activeMs);
        const linked = field(session, 'targetLabelSnapshot');
        return <article key={field(session, 'id')} className={styles.session}>
          <div><strong>{field(session, 'label') || 'Deep Work'}</strong><small>{linked || 'Session libre'}</small></div>
          <span>{measured === null ? 'Durée réelle inconnue' : `${formatMeasuredFocusMs(measured)} mesurées`}</span>
          {measured === null && <small className={styles.legacy}>Valeur historique : {field(session, 'minutes') || '—'} min, non assimilée à une mesure.</small>}
          {session.rewardStatus === 'pending' && <button type="button" className={styles.secondary} onClick={() => void submit('focus.claim', { id: field(session, 'id'), expectedRevision: revision(session) })} disabled={localBusy || hasUncertainCommand}>RÉESSAYER LE CRÉDIT FOCUS</button>}
        </article>;
      })}
    </div>
  </section>;
}
