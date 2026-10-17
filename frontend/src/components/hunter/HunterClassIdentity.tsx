'use client';

import { useState, type CSSProperties } from 'react';
import { Minus, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { HUNTER_CLASSES, hunterClassFor, type HunterClassCode } from '@/lib/hunter/classes';
import styles from './HunterClasses.module.css';

export function HunterClassMark({ emblem, className = '' }: { emblem: string; className?: string }) {
  return <svg className={className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {emblem === 'compass' && <><circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="15"/><path d="m39 23-4 13-10 5 4-13 10-5Z"/><path d="M32 5v5M59 32h-5M32 59v-5M5 32h5"/></>}
    {emblem === 'shield' && <><path d="M32 7 51 14v15c0 13-8 22-19 28-11-6-19-15-19-28V14L32 7Z"/><path d="M32 17v29M22 27h20M25 37h14"/><path d="m27 17 5-5 5 5"/></>}
    {emblem === 'book' && <><path d="M9 15c8-3 16-1 23 4 7-5 15-7 23-4v34c-8-2-16 0-23 5-7-5-15-7-23-5V15Z"/><path d="M32 19v35M15 23c5-1 9 0 13 2M15 31c5-1 9 0 13 2M49 23c-5-1-9 0-13 2M49 31c-5-1-9 0-13 2"/></>}
    {emblem === 'flame' && <><path d="M34 7c3 11-3 13 5 22 2-5 5-7 8-9 8 12 9 22 2 31-9 11-27 9-34-2-6-9-2-20 8-29-1 9 1 12 4 14 3-8 2-17 7-27Z"/><path d="M32 34c5 6 7 10 4 15-2 4-8 4-10 0-2-4 0-9 6-15Z"/></>}
    {emblem === 'knot' && <><path d="M17 22c6-8 18-9 25-2l7 7c7 7 5 19-3 25-7 5-16 4-22-2l-4-4"/><path d="M47 42c-6 8-18 9-25 2l-7-7c-7-7-5-19 3-25 7-5 16-4 22 2l4 4"/><path d="m24 24 16 16M40 24 24 40"/></>}
  </svg>;
}

export function HunterClassOptions({
  selected,
  onSelect,
  allowNone = true,
  compact = false,
}: {
  selected: HunterClassCode | null;
  onSelect: (code: HunterClassCode | null) => void;
  allowNone?: boolean;
  compact?: boolean;
}) {
  return <div className={`${styles.choices} ${compact ? styles.choicesCompact : ''}`} role="group" aria-label="Classes Hunter">
    {HUNTER_CLASSES.map(item => <button
      key={item.code}
      type="button"
      aria-pressed={selected === item.code}
      onClick={() => onSelect(item.code)}
      className={`${styles.choice} ${selected === item.code ? styles.choiceSelected : ''}`}
      style={{ '--class-accent': item.accent, '--class-secondary': item.secondary } as CSSProperties}
    >
      <span className={styles.choiceHead}><span className={styles.choiceMark}><HunterClassMark emblem={item.emblem}/></span><span className={styles.choiceTitle}><strong>{item.name}</strong><small>{item.title}</small></span>{selected === item.code && <span className={styles.selectedDot} aria-label="Sélectionnée"/>}</span>
      <span className={styles.choiceDescription}>{item.description}</span>
      <span className={styles.choiceNarrative}>{item.affinity}</span>
      <span className={styles.choiceObjective}><b>Objectif</b> · {item.objective}</span>
      <span className={styles.choiceAffinity}>{item.attributeLabel}</span>
    </button>)}
    {allowNone && <button type="button" aria-pressed={selected === null} onClick={() => onSelect(null)} className={`${styles.noneChoice} ${selected === null ? styles.noneSelected : ''}`}>
      <span className={styles.noneMark} aria-hidden="true"><Minus size={18}/></span><span><strong>Aucune classe</strong><small>Tu pourras choisir plus tard.</small></span>
    </button>}
  </div>;
}

export function HunterClassIdentity({
  classCode,
  profileRevision,
  variant,
  onSelect,
}: {
  classCode: unknown;
  profileRevision: string;
  variant: 'dashboard' | 'core';
  onSelect: (code: HunterClassCode | null, revision: string) => Promise<boolean>;
}) {
  const current = hunterClassFor(classCode);
  const currentCode = current?.code ?? null;
  const [editing, setEditing] = useState(false);
  const [candidate, setCandidate] = useState<HunterClassCode | null>(currentCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    if (busy) return;
    if (candidate === currentCode) { setEditing(false); return; }
    setBusy(true); setError('');
    try {
      if (await onSelect(candidate, profileRevision)) setEditing(false);
      else setError('Le changement n’a pas été confirmé. Vérifie la progression et réessaie.');
    } catch {
      setError('Le changement n’a pas été confirmé. Vérifie la progression et réessaie.');
    } finally { setBusy(false); }
  }

  const themed = current ? { '--class-accent': current.accent, '--class-secondary': current.secondary } as CSSProperties : undefined;
  return <section className={`${styles.identity} ${variant === 'core' ? styles.identityCore : styles.identityDashboard}`} style={themed} aria-label="Classe Hunter">
    <span className={styles.identitySigil} aria-hidden="true">{current ? <HunterClassMark emblem={current.emblem}/> : <span>?</span>}</span>
    <div className={styles.identityCopy}>
      {current ? <><strong>{current.name}</strong><span>{current.title}</span><small>{current.affinity}</small><small>Objectif · {current.objective}</small><small>Affinités · {current.attributeLabel}</small></>
        : <><strong>Aucune classe choisie</strong><span>Ton profil Hunter reste complet.</span><small>La classe est facultative et sans effet sur ta progression.</small></>}
    </div>
    <button type="button" className={styles.identityAction} onClick={() => { setCandidate(currentCode); setError(''); setEditing(true); }}>
      {current ? 'Changer' : 'Choisir une classe'}
    </button>
    {editing && <Modal label="Choisir ou changer de classe" onClose={() => { if (!busy) setEditing(false); }} className={styles.dialogBackdrop}>
      <div className={styles.dialog} style={candidate ? { '--class-accent': hunterClassFor(candidate)?.accent } as CSSProperties : undefined}>
        <div className={styles.dialogHeader}><div><span>IDENTITÉ HUNTER</span><h2>{current ? 'Changer de classe' : 'Choisir une classe'}</h2></div><button type="button" className={styles.closeButton} onClick={() => setEditing(false)} disabled={busy} aria-label="Fermer"><X size={18}/></button></div>
        <p className={styles.dialogIntro}>Choisis librement une autre voie ou reste sans classe. Ce choix est narratif : il ne modifie ni XP, ni niveau, ni rang, ni attributs.</p>
        <HunterClassOptions selected={candidate} onSelect={setCandidate}/>
        {error && <p className={styles.dialogError} role="alert">{error}</p>}
        <div className={styles.dialogActions}><button type="button" className={styles.cancelButton} onClick={() => setEditing(false)} disabled={busy}>Annuler</button><button type="button" className={styles.confirmButton} onClick={() => void confirm()} disabled={busy}>{busy ? 'Enregistrement…' : 'Confirmer ce choix'}</button></div>
      </div>
    </Modal>}
  </section>;
}
