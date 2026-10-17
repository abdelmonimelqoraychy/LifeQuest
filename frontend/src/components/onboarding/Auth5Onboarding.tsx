'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import SessionLogout from '@/components/auth/SessionLogout';
import { HunterClassOptions } from '@/components/hunter/HunterClassIdentity';
import { isHunterClassCode, type HunterClassCode } from '@/lib/hunter/classes';

const GOALS = ['Études & apprentissage', 'Développement de projets', 'Sport & bien-être', 'Lecture', 'Concentration', 'Gestion du temps'];
const stages = ['intro', 'identity', 'avatar', 'goals', 'review', 'complete'] as const;
type Stage = typeof stages[number] | 'activation';
type Draft = { name: string; age: string; gender: string; avatar: string; goals: string[]; timezone: string; classCode: HunterClassCode | null };
type Props = { initial: Record<string, unknown>; actor: string };
const initialDraft: Draft = { name: '', age: '', gender: 'prefer_not_to_say', avatar: 'male', goals: [], timezone: '', classCode: null };
const obj = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};

export default function Auth5Onboarding({ initial, actor }: Props) {
  const router = useRouter();
  const firstVideo = obj(initial.video);
  const activation = obj(initial.activation);
  const initialStage = stages.includes(initial.step as (typeof stages)[number]) ? initial.step as (typeof stages)[number] : 'intro';
  const [stage, setStage] = useState<Stage>(initial.state === 'ready' ? 'activation' : firstVideo.consumed === true ? (initialStage === 'intro' ? 'identity' : initialStage) : 'intro');
  const savedDraft = obj(initial.draft);
  const [draft, setDraft] = useState<Draft>({ ...initialDraft, ...savedDraft, age: String(savedDraft.age ?? ''), classCode: isHunterClassCode(savedDraft.classCode) ? savedDraft.classCode : null } as Draft);
  const [resumeAt] = useState(Number(initial.state === 'ready' ? activation.resumeSeconds || 0 : firstVideo.resumeSeconds || 0));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  const mountedActor = useRef(actor);
  const lastCheckpoint = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const autosaveTimer = useRef<number | undefined>(undefined);
  const dirty = useRef(false);
  const busySync = useRef(false);

  const enqueue = useCallback((kind: string, payload: Record<string, unknown>) => {
    const operation = queue.current.then(async () => {
      if (mountedActor.current !== actor) throw new Error('SESSION_CHANGED');
      const response = await fetch('/api/hunter/onboarding', {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, payload, requestId: crypto.randomUUID() }),
      });
      const result = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(typeof result.code === 'string' ? result.code : 'ONBOARDING_UNAVAILABLE');
      return result;
    });
    queue.current = operation.then(() => undefined, () => undefined);
    return operation;
  }, [actor]);

  useEffect(() => {
    if (!dirty.current || stage === 'intro' || stage === 'complete') return;
    autosaveTimer.current = window.setTimeout(() => {
      dirty.current = false;
      void enqueue('draft.save', { step: stage, draft: { ...draft, age: draft.age === '' ? null : Number(draft.age) } })
        .then(() => { setSaved(true); setError(''); })
        .catch(reason => { dirty.current = true; setSaved(false); setError(friendly(reason)); });
    }, 650);
    return () => { if (autosaveTimer.current !== undefined) window.clearTimeout(autosaveTimer.current); };
  }, [draft, enqueue, stage]);

  useEffect(() => {
    const channel = new BroadcastChannel('lifequest-auth');
    channel.onmessage = () => { if (mountedActor.current === actor) { mountedActor.current = ''; router.replace('/login'); } };
    return () => channel.close();
  }, [actor, router]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    dirty.current = true; setSaved(false); setDraft(current => ({ ...current, [key]: value }));
  }

  async function saveStage(next: Stage) {
    if (busySync.current) return;
    busySync.current = true; setBusy(true); setError('');
    try {
      if (autosaveTimer.current !== undefined) window.clearTimeout(autosaveTimer.current);
      dirty.current = false;
      await enqueue('draft.save', { step: next, draft: { ...draft, age: draft.age === '' ? null : Number(draft.age) } });
      setStage(next); setSaved(true);
    } catch (reason) { dirty.current = true; setError(friendly(reason)); }
    finally { busySync.current = false; setBusy(false); }
  }

  async function finishVideo(outcome: 'ended' | 'skipped' | 'error_dismissed') {
    if (busySync.current) return;
    busySync.current = true; setBusy(true); setError('');
    try {
      await enqueue(stage === 'activation' ? 'activation.finish' : 'video.finish', { outcome });
      if (stage === 'activation') router.replace('/dashboard');
      else setStage('identity');
    } catch (reason) { setError(friendly(reason)); }
    finally { busySync.current = false; setBusy(false); }
  }

  async function complete() {
    if (busySync.current) return;
    busySync.current = true; setBusy(true); setError('');
    try {
      if (autosaveTimer.current !== undefined) window.clearTimeout(autosaveTimer.current);
      await enqueue('draft.save', { step: 'review', draft: { ...draft, age: Number(draft.age) } });
      const result = await enqueue('onboarding.complete', { draft: { ...draft, age: Number(draft.age) } });
      if (result.state !== 'ready' || result.actor !== actor) throw new Error('RESULT_INVALID');
      setStage('activation');
    } catch (reason) { setError(friendly(reason)); }
    finally { busySync.current = false; setBusy(false); }
  }

  const saveVideoCheckpoint = useCallback(() => {
    const seconds = video.current?.currentTime;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0 || seconds - lastCheckpoint.current < 5) return;
    lastCheckpoint.current = seconds;
    void enqueue(stage === 'activation' ? 'activation.checkpoint' : 'video.checkpoint', { seconds: Math.floor(seconds) }).catch(() => setError('Checkpoint vidéo non confirmé. La lecture reprendra au dernier point enregistré.'));
  }, [enqueue, stage]);

  if (stage === 'activation') return <main className="ob-page">
    <header className="ob-header"><div className="ob-brand">LIFE<span>QUEST</span></div><SessionLogout /></header>
    <div className="ob-progress" aria-label="Activation Hunter">ACTIVATION HUNTER</div>
    <section className="ob-stage ob-intro">
      <div className="ob-cinema">
        <video ref={video} className="ob-video" src="/cinematics/player-activation.mp4" playsInline muted={muted} autoPlay preload="metadata" onPlay={() => setPaused(false)} onPause={() => { setPaused(true); saveVideoCheckpoint(); }}
          onLoadedMetadata={event => { const player = event.currentTarget; if (resumeAt > 0 && Number.isFinite(player.duration)) player.currentTime = Math.min(resumeAt, Math.max(0, player.duration - 1)); }}
          onTimeUpdate={saveVideoCheckpoint} onEnded={() => void finishVideo('ended')}
          onError={() => setError('La vidéo ne peut pas être lue. Tu peux continuer sans déclarer qu’elle a été visionnée.')} />
        <div className="ob-cinema-content"><span className="ob-tag">[ HUNTER ACTIVATION ]</span><h1>YOU ARE A PLAYER</h1><p>Ton aventure commence maintenant.</p></div>
      </div>
      <div className="ob-intro-actions"><span>HUNTER CRÉÉ · NIVEAU 1 · RANG E · 0 XP</span><div className="ob-buttons"><button className="ob-text-btn" type="button" onClick={() => void finishVideo(error ? 'error_dismissed' : 'skipped')} disabled={busy}>{error ? 'Continuer sans lecture' : 'Passer la vidéo'}</button><button className="ob-text-btn" type="button" onClick={() => setMuted(value => !value)}>{muted ? 'Activer le son' : 'Couper le son'}</button><button className="ob-primary" type="button" onClick={() => { const player = video.current; if (player?.paused) void player.play(); else player?.pause(); }}>{paused ? 'Lire' : 'Pause'}</button></div></div>
      {error && <p className="ob-error" role="alert">{error}</p>}
    </section>
    <footer className="ob-bottom"><span>CHECKPOINT D’ACTIVATION SERVEUR</span><span>06 / 06</span></footer>
  </main>;

  if (stage === 'intro') return <main className="ob-page">
    <header className="ob-header"><div className="ob-brand">LIFE<span>QUEST</span></div><SessionLogout /></header>
    <div className="ob-progress" aria-label="Étape 1 sur 5">01 / INTRODUCTION</div>
    <section className="ob-stage ob-intro">
      <div className="ob-cinema">
        <video ref={video} className="ob-video" src="/cinematics/intro-sacrifice.mp4" playsInline muted={muted} autoPlay preload="metadata" onPlay={() => setPaused(false)} onPause={() => { setPaused(true); saveVideoCheckpoint(); }}
          onLoadedMetadata={event => { const player = event.currentTarget; if (resumeAt > 0 && Number.isFinite(player.duration)) player.currentTime = Math.min(resumeAt, Math.max(0, player.duration - 1)); }}
          onTimeUpdate={saveVideoCheckpoint} onEnded={() => void finishVideo('ended')}
          onError={() => setError('La vidéo ne peut pas être lue. Tu peux continuer sans déclarer qu’elle a été visionnée.')} />
        <div className="ob-cinema-content"><span className="ob-tag">[ INTRODUCTION // THE AWAKENING ]</span><h1>THE AWAKENING</h1><p>Chaque histoire commence par un choix. Quelle sera la tienne ?</p></div>
      </div>
      <div className="ob-intro-actions"><span>INTRODUCTION · CHECKPOINT SERVEUR</span><div className="ob-buttons"><button className="ob-text-btn" type="button" onClick={() => void finishVideo(error ? 'error_dismissed' : 'skipped')} disabled={busy}>{error ? 'Continuer sans lecture' : 'Passer la vidéo'}</button><button className="ob-text-btn" type="button" onClick={() => setMuted(value => !value)}>{muted ? 'Activer le son' : 'Couper le son'}</button><button className="ob-primary" type="button" onClick={() => { const player = video.current; if (player?.paused) void player.play(); else player?.pause(); }}>{paused ? 'Lire' : 'Pause'}</button></div></div>
      {error && <p className="ob-error" role="alert">{error}</p>}
    </section>
    <footer className="ob-bottom"><span>PARCOURS SERVEUR SÉCURISÉ</span><span>01 / 05</span></footer>
  </main>;

  return <main className="ob-page">
    <div className="ob-aura ob-aura-one" aria-hidden="true"/><div className="ob-aura ob-aura-two" aria-hidden="true"/><div className="ob-grid" aria-hidden="true"/>
    <header className="ob-header"><div className="ob-brand">LIFE<span>QUEST</span></div><div className="ob-header-side">CHECKPOINT SERVEUR · {saved ? 'ENREGISTRÉ' : 'SAISIE NON CONFIRMÉE'}</div><SessionLogout /></header>
    <div className="ob-progress" aria-label={`Étape ${stages.indexOf(stage) + 1} sur 5`}>{stages.slice(1, 5).map((name, index) => <div key={name} className={`ob-progress-item ${stages.indexOf(stage) >= index + 1 ? 'ob-progress-active' : ''}`}><span>{String(index + 2).padStart(2, '0')}</span><small>{name.toUpperCase()}</small></div>)}</div>
    <section className="ob-stage">
      {stage === 'identity' && <div className="ob-form-layout"><div className="ob-aside"><span className="ob-tag">[ NEW HUNTER DETECTED ]</span><h1>IDENTIFIE TON HÉROS.</h1><p>Ton identité est enregistrée sur ton compte après confirmation serveur.</p></div><div className="ob-panel ob-form"><h2>Player identification</h2><label htmlFor="ob-name">Nom ou pseudo</label><input id="ob-name" maxLength={40} value={draft.name} onChange={e => update('name', e.target.value)} required/><label htmlFor="ob-age">Âge</label><input id="ob-age" type="number" min={13} max={120} value={draft.age} onChange={e => update('age', e.target.value)} required/><label htmlFor="ob-gender">Genre</label><select id="ob-gender" value={draft.gender} onChange={e => update('gender', e.target.value)}><option value="prefer_not_to_say">Je préfère ne pas préciser</option><option value="male">Homme</option><option value="female">Femme</option><option value="other">Autre</option></select><button className="ob-primary ob-full" disabled={busy || !draft.name.trim() || Number(draft.age) < 13 || Number(draft.age) > 120} onClick={() => void saveStage('avatar')}>CONTINUER</button></div></div>}
      {stage === 'avatar' && <div className="ob-panel ob-reveal"><span className="ob-tag">[ CHARACTER SYNCHRONIZATION ]</span><h1>CHOISIS TON AVATAR</h1><div className="ob-avatars">{(['male', 'female'] as const).map(avatar => <button type="button" key={avatar} aria-pressed={draft.avatar === avatar} className={`ob-avatar ${draft.avatar === avatar ? 'ob-avatar-selected' : ''}`} onClick={() => update('avatar', avatar)}><strong>{avatar === 'male' ? 'SHADOW HUNTER' : 'ASTRAL HUNTER'}</strong></button>)}</div><div className="ob-footer-actions"><button className="ob-text-btn" onClick={() => void saveStage('identity')}>RETOUR</button><button className="ob-primary" disabled={busy} onClick={() => void saveStage('goals')}>CONFIRMER LE HÉROS</button></div></div>}
      {stage === 'goals' && <div className="ob-panel ob-goals"><span className="ob-tag">[ OBJECTIVE REGISTRATION ]</span><h1>QUELLE EST TA QUÊTE ?</h1><div className="ob-goal-grid">{GOALS.map(goal => <button type="button" key={goal} aria-pressed={draft.goals.includes(goal)} className={`ob-goal ${draft.goals.includes(goal) ? 'ob-goal-selected' : ''}`} onClick={() => update('goals', draft.goals.includes(goal) ? draft.goals.filter(item => item !== goal) : [...draft.goals, goal])}>{goal}</button>)}</div><label htmlFor="ob-timezone-confirm">Fuseau horaire IANA confirmé pour tes futurs calculs</label><input id="ob-timezone-confirm" value={draft.timezone} onChange={e => update('timezone', e.target.value)} placeholder="Ex. Africa/Casablanca" autoComplete="off"/><p className="ob-hint">Choisis explicitement un identifiant IANA ; aucun fuseau n’est sélectionné automatiquement.</p><div className="ob-footer-actions"><button className="ob-text-btn" onClick={() => void saveStage('avatar')}>RETOUR</button><button className="ob-primary" disabled={busy || draft.goals.length === 0 || !draft.timezone.trim()} onClick={() => void saveStage('review')}>VALIDER MES QUÊTES</button></div></div>}
      {stage === 'review' && <div className="ob-panel ob-activation"><span className="ob-tag">[ FINAL VALIDATION ]</span><h1>CONFIRME TON HUNTER</h1><p>{draft.name} · niveau 1 · rang E · 0 XP</p><p>{draft.goals.join(' · ')}</p><section className="ob-class-choice" aria-labelledby="ob-class-title"><div><h2 id="ob-class-title">Choisis une classe, si tu le souhaites</h2><p>Une identité narrative, sans bonus ni pénalité. Tu pourras la choisir ou la changer plus tard.</p></div><HunterClassOptions selected={draft.classCode} onSelect={code => update('classCode', code)} compact/></section><label htmlFor="ob-timezone">Fuseau horaire IANA confirmé pour tes futurs calculs</label><input id="ob-timezone" value={draft.timezone} onChange={e => update('timezone', e.target.value)} placeholder="Ex. Africa/Casablanca" autoComplete="off"/><p className="ob-hint">Saisis et confirme un identifiant IANA (ex. Africa/Casablanca). Aucun fuseau n’est choisi silencieusement.</p>{error && <p className="ob-error" role="alert">{error}</p>}<div className="ob-footer-actions"><button className="ob-text-btn" onClick={() => void saveStage('goals')}>RETOUR</button><button className="ob-primary" disabled={busy || !draft.timezone.trim()} onClick={() => void complete()}>{busy ? 'CRÉATION…' : 'CRÉER MON HUNTER'}</button></div></div>}
      {error && stage !== 'review' && <p className="ob-error" role="alert">{error}</p>}
    </section>
    <footer className="ob-bottom"><span>IDENTITÉ {actor.slice(0, 8)} · AUCUNE SAUVEGARDE LOCALE</span><span>{String(stages.indexOf(stage) + 1).padStart(2, '0')} / 05</span></footer>
  </main>;
}

function friendly(reason: unknown) {
  const code = reason instanceof Error ? reason.message : '';
  if (code === 'VALIDATION_FAILED') return 'Vérifie les champs, tes objectifs et le fuseau IANA.';
  if (code === 'ONBOARDING_STEP_LOCKED' || code === 'ONBOARDING_INCOMPLETE') return 'Termine les étapes précédentes et confirme leur sauvegarde.';
  if (code === 'AUTH_REQUIRED' || code === 'SESSION_EXPIRED' || code === 'SESSION_CHANGED') return 'La session a changé. Reconnecte-toi pour reprendre le checkpoint de ton compte.';
  return 'Le serveur n’a pas confirmé cette étape. Réessaie ; aucune création partielle n’est annoncée.';
}
