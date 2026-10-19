'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Swords } from 'lucide-react';
import type { HunterRow } from '@/lib/hunter/cloud';
import {
  buildMindMapBossDraft,
  mindMapBossPayload,
  sameMindMapBranch,
  validateMindMapBossDraft,
  type BossDraftStep,
  type MindMapBossDraft,
} from '@/lib/hunter/mindMapBoss';
import styles from './MindMapBossPreview.module.css';

type Props = {
  nodes: HunterRow[];
  bosses: HunterRow[];
  selectedParentId: string;
  revision: (bucket: string, row: HunterRow) => string;
  onCommand: (kind: string, payload: HunterRow) => Promise<unknown>;
  onRetry: () => Promise<unknown>;
  hasUncertainCommand: boolean;
  error: string;
};

const text = (row: HunterRow, key: string) => typeof row[key] === 'string' ? row[key] as string : '';

export default function MindMapBossPreview({ nodes, bosses, selectedParentId, revision, onCommand, onRetry, hasUncertainCommand, error }: Props) {
  const submitLock = useRef(false);
  const [draft, setDraft] = useState<MindMapBossDraft | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [created, setCreated] = useState(false);
  const mappedNodes = nodes.map(row => ({
    id: text(row, 'id'),
    parentId: text(row, 'parentId') || null,
    title: text(row, 'title'),
    revision: revision('nodes', row),
    sortPosition: text(row, 'sortPosition') || String(row.sortPosition ?? ''),
  }));
  const currentBranch = selectedParentId ? buildMindMapBossDraft(mappedNodes, selectedParentId) : null;
  const branchIsCurrent = !!draft && !!currentBranch && draft.source.parentId === selectedParentId && sameMindMapBranch(draft.source, currentBranch.source);
  const alreadyConverted = !!draft && bosses.some(boss => text(boss, 'sourceMindNodeId') === draft.source.parentId)
    || !!selectedParentId && bosses.some(boss => text(boss, 'sourceMindNodeId') === selectedParentId);
  const validationError = draft ? validateMindMapBossDraft(draft.title, draft.steps) : null;
  const totalWeight = draft?.steps.reduce((sum, step) => sum + (Number.isFinite(step.weight) ? step.weight : 0), 0) ?? 0;

  function preview() {
    const next = buildMindMapBossDraft(mappedNodes, selectedParentId);
    setCreated(false);
    setConfirmed(false);
    setMessage(next ? '' : 'Choisissez un nœud parent avec 1 à 20 enfants directs et des révisions valides.');
    setDraft(next);
  }

  function cancelPreview() {
    if (busy || hasUncertainCommand) return;
    setDraft(null);
    setConfirmed(false);
    setCreated(false);
    setMessage('');
  }

  function updateStep(sourceId: string, patch: Partial<Pick<BossDraftStep, 'title' | 'weight'>>) {
    setConfirmed(false);
    setDraft(current => current ? { ...current, steps: current.steps.map(step => step.sourceId === sourceId ? { ...step, ...patch } : step) } : current);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !branchIsCurrent || alreadyConverted || validationError || !confirmed || submitLock.current || hasUncertainCommand) return;
    submitLock.current = true;
    setBusy(true);
    setMessage('');
    try {
      const result = await onCommand('boss.create', mindMapBossPayload(draft, draft.steps));
      if (result) {
        setCreated(true);
        setConfirmed(false);
        setMessage('Boss créé. La progression et toute récompense future restent gérées par les commandes serveur.');
      }
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  }

  return <section className={styles.preview} aria-labelledby="mind-boss-title">
    <div className={styles.heading}>
      <span className={styles.icon} aria-hidden="true"><Swords size={19}/></span>
      <div><h3 id="mind-boss-title">Mind Map → Boss</h3>
        <p>Prévisualisez les enfants directs du nœud sélectionné. Vous pourrez ajuster leur intitulé et leur poids.</p></div>
    </div>

    {!draft && <div className={styles.actions}>
      <button type="button" className={styles.previewButton} onClick={preview} disabled={!selectedParentId || !currentBranch || alreadyConverted}>
        Prévisualiser en Boss
      </button>
      {!selectedParentId && <span className={styles.notice}>Sélectionnez un nœud parent dans la carte.</span>}
      {selectedParentId && !currentBranch && <span className={styles.notice}>Cette branche doit avoir entre 1 et 20 enfants directs.</span>}
      {alreadyConverted && <span className={styles.notice}>Cette branche est déjà liée à un Boss.</span>}
    </div>}

    {draft && <>
      {alreadyConverted && !created && <p className={styles.alert} role="alert">Cette branche a déjà été convertie. Une deuxième création est refusée par le serveur.</p>}
      {!branchIsCurrent && !alreadyConverted && <p className={styles.alert} role="alert">La branche a changé depuis l’aperçu. Actualisez-le pour charger les enfants et révisions actuels.</p>}
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.field}>TITRE DU BOSS
          <input value={draft.title} maxLength={80} required disabled={busy || hasUncertainCommand || created || alreadyConverted} onChange={event => { setConfirmed(false); setDraft(current => current ? { ...current, title: event.target.value } : current); }}/>
        </label>
        <ol className={styles.steps} aria-label="Étapes directes de la branche">
          {draft.steps.map((step, index) => <li key={step.sourceId}>
            <fieldset className={styles.step}>
              <legend>ÉTAPE {index + 1}</legend>
              <label className={styles.field}>OBJECTIF
                <input value={step.title} maxLength={120} required disabled={busy || hasUncertainCommand || created || alreadyConverted} onChange={event => updateStep(step.sourceId, { title: event.target.value })}/>
              </label>
              <label className={styles.weight}>POIDS
                <input type="number" value={step.weight} min={1} max={1000} step={1} required disabled={busy || hasUncertainCommand || created || alreadyConverted} onChange={event => updateStep(step.sourceId, { weight: event.target.value === '' ? Number.NaN : Number(event.target.value) })}/>
              </label>
              <div className={styles.weightPreview} aria-label={`Part pondérée ${step.weight} sur ${totalWeight}`}>
                <span>Part de progression : {totalWeight > 0 && Number.isFinite(step.weight) ? `${(step.weight / totalWeight * 100).toFixed(1)} %` : '—'}</span>
                <div className={styles.track} role="meter" aria-label={`Part pondérée de l’étape ${index + 1}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={totalWeight > 0 && Number.isFinite(step.weight) ? Math.round(step.weight / totalWeight * 100) : 0}>
                  <div className={styles.trackFill} style={{ transform: `scaleX(${totalWeight > 0 && Number.isFinite(step.weight) ? Math.min(1, step.weight / totalWeight) : 0})` }}/>
                </div>
              </div>
            </fieldset>
          </li>)}
        </ol>
        <p className={styles.copy}>Poids total : <strong>{totalWeight}/1 000</strong>. Les poids définissent la progression des étapes et influencent la récompense future selon les règles du serveur. Aucun XP n’est attribué par cet aperçu.</p>
        {validationError && <p className={styles.alert} role="alert">{validationError}</p>}
        {error && <p className={`${styles.alert} ${styles.error}`} role="alert">{error}</p>}
        {hasUncertainCommand && <div className={styles.notice} role="status">Résultat réseau inconnu. Les champs restent verrouillés : réessayez la même commande avec le même requestId.
          <div className={styles.actions}><button type="button" className={styles.retryButton} onClick={async () => { const result = await onRetry(); if (result) { setCreated(true); setConfirmed(false); setMessage('Boss créé et confirmé par son reçu serveur.'); } }}>Réessayer la même création</button></div>
        </div>}
        {message && <p className={created ? styles.success : styles.notice} role={created ? 'status' : 'alert'}>{message}</p>}
        {!created && <label className={styles.confirm}><input type="checkbox" checked={confirmed} disabled={busy || hasUncertainCommand || !branchIsCurrent || alreadyConverted || !!validationError} onChange={event => setConfirmed(event.target.checked)}/>
          Je confirme la création d’un Boss à partir de cette branche Mind Map.
        </label>}
        <div className={styles.actions}>
          <button type="button" className={styles.refreshButton} onClick={cancelPreview} disabled={busy || hasUncertainCommand}>Annuler</button>
          {!branchIsCurrent && !alreadyConverted && <button type="button" className={styles.refreshButton} onClick={preview}>Actualiser l’aperçu</button>}
          <button type="submit" className={styles.confirmButton} disabled={busy || hasUncertainCommand || !branchIsCurrent || alreadyConverted || !!validationError || !confirmed}>{busy ? 'CRÉATION…' : 'Créer le Boss'}</button>
        </div>
      </form>
    </>}
  </section>;
}
