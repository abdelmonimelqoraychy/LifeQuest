'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocalDay } from '@/lib/useLocalDay';
import { Activity, ArrowUpRight, BookOpen, Brain, BrainCircuit, Check, ChevronRight, Clock3, Crown, Focus, HeartPulse, Lightbulb, Network, NotebookPen, Repeat2, Shield, Sparkles, Swords, Target, Trash2, UserRound, Zap } from 'lucide-react';
import SystemShell from '@/components/system/SystemShell';
import Modal from '@/components/ui/Modal';
import QuestCommandCenter, { type QuestDraft } from '@/components/quests/QuestCommandCenter';
import { useHunterCloud, hunterNumber, hunterRows, hunterText, type HunterRow, type HunterSnapshot } from '@/lib/hunter/cloud';
import { getCharacterEvolution, MAX_LEVEL } from '@/lib/characterEvolution';
import { getHunterProgress } from '@/lib/hunterCore';
import { rankForLevel } from '@/lib/hunterMissions';
import { achievementProgress } from '@/lib/achievements';
import { PROMPTS } from '@/lib/hunterLab';
import type { Attribute } from '@/types';
import type { Completion, Frequency, QuestSystemState, StoryArc, SystemQuest } from '@/lib/questSystem';
import premiumDashboard from '@/app/dashboard/DashboardPremium.module.css';
import questUI from '@/components/system/QuestUI.module.css';
import coreStyles from '@/app/hunter-core/HunterCore.module.css';
import operations from '@/app/hunter-operations/HunterOperations.module.css';
import labStyles from '@/app/hunter-lab/HunterLab.module.css';
import { HunterClassIdentity } from '@/components/hunter/HunterClassIdentity';
import MindMapBossPreview from '@/components/hunter/MindMapBossPreview';
import FocusQuestLink from '@/components/hunter/FocusQuestLink';

type Section = 'dashboard' | 'quests' | 'create' | 'arcs' | 'core' | 'operations' | 'lab';
type Data = NonNullable<HunterSnapshot['data']>;
const text = (row: HunterRow | null | undefined, key: string, fallback = '') => hunterText(row?.[key]) || fallback;
const num = (row: HunterRow | null | undefined, key: string, fallback = 0) => hunterNumber(row?.[key]) ?? fallback;
const rows = (row: HunterRow | null | undefined, key: string) => hunterRows(row?.[key]);
function dayInZone(instant:string|undefined,zone:string|undefined){if(!instant)return '';try{const p=new Intl.DateTimeFormat('en-US',{timeZone:zone||'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant));const x=Object.fromEntries(p.map(v=>[v.type,v.value]));return `${x.year}-${x.month}-${x.day}`}catch{return instant.slice(0,10)}}
const questPayload = (draft: QuestDraft): HunterRow => ({ title: draft.title, description: draft.description, frequency: draft.frequency,
  difficulty: draft.difficulty, attribute: draft.attribute, arcId: draft.arcId || null, targetDate: draft.frequency === 'once' ? draft.targetDate || null : null });

function toQuestState(data: Data): QuestSystemState {
  const quests = hunterRows(data.system.quests).map(row => ({ id: text(row, 'id'), title: text(row, 'title'), description: text(row, 'description'),
    frequency: text(row, 'frequency', 'daily') as Frequency, difficulty: text(row, 'difficulty', 'NORMAL') as SystemQuest['difficulty'],
    attribute: text(row, 'attribute', 'discipline') as Attribute, xp: num(row, 'xp'), createdAt: text(row, 'createdAt'),
    arcId: text(row, 'arcId') || undefined, targetDate: text(row, 'targetDate') || undefined, archived: row.archived === true,
    revision: num(row, 'revision') } satisfies SystemQuest));
  const arcs = hunterRows(data.system.arcs).map(row => ({ id: text(row, 'id'), title: text(row, 'title'),
    description: text(row, 'description'), targetDate: text(row, 'targetDate'), createdAt: text(row, 'createdAt') } satisfies StoryArc));
  const completions = hunterRows(data.system.completions).map(row => ({ id: text(row, 'id'), questId: text(row, 'questId'),
    period: text(row, 'period'), completedAt: text(row, 'completedAt'), xpAwarded: num(row, 'xpAwarded'),
    attribute: text(row, 'attribute', 'discipline') as Attribute, questTitle: text(row, 'questTitle') || undefined,
    arcId: text(row, 'arcId') || null } satisfies Completion));
  return { version: 1, totalXP: num(data.system, 'totalXP'), quests, arcs, completions,
    achievements: hunterRows(data.system.achievements).map(row => ({ id: text(row, 'id') as never, unlockedAt: text(row, 'unlockedAt') })) };
}

export default function HunterWorkspace({ section }: { section: Section }) {
  const cloud = useHunterCloud(), snapshot = cloud.snapshot, data = snapshot.data;
  const [reward, setReward] = useState<{ title: string; xp: string } | null>(null);
  if (!data || snapshot.state !== 'ready') return <SystemShell title="SYSTEM STATUS" subtitle="SNAPSHOT VERIFICATION"><p role="status">The authenticated Hunter snapshot is being verified.</p></SystemShell>;
  const state = toQuestState(data), revisions = snapshot.entityRevisions || {};
  const revision = (bucket: string, row: HunterRow) => {
    const map = revisions[bucket];
    return map && typeof map === 'object' ? hunterText((map as HunterRow)[text(row, 'id')]) || text(row, 'revision', '0') : text(row, 'revision', '0');
  };
  async function act(kind: string, payload: HunterRow) {
    const result = await cloud.command(kind, payload);
    if (result) {
      const detail = result.result;
      if (!kind.startsWith('focus.') && detail && detail.credited === true && detail.xp !== undefined) {
        setReward({ title: hunterText(detail.title) || (section === 'dashboard' ? 'Quête validée' : 'QUEST COMPLETE'), xp: hunterText(detail.xp) });
      }
      return result;
    }
    return null;
  }
  const titles: Record<Section, [string, string]> = {
    dashboard: ['SYSTÈME HUNTER', 'Progression, missions et concentration'], quests: ['QUEST LOG', 'THE SYSTEM RECORDS EVERY MISSION'],
    create: ['QUEST EDITOR', 'THE SYSTEM ACCEPTS A NEW MISSION'], arcs: ['STORY ARCS', 'YOUR LONG-TERM PATH IS WRITTEN HERE'],
    core: ['HUNTER CORE', 'ONE SYSTEM. REAL PROGRESSION.'], operations: ['HUNTER OPERATIONS', 'MISSIONS - ACHIEVEMENTS - HISTORY'],
    lab: ['HUNTER LAB', 'FOCUS. CREATE. EVOLVE.'],
  };
  return <SystemShell title={titles[section][0]} subtitle={titles[section][1]} dashboardChrome={section === 'dashboard'}>
    {section === 'dashboard' && <Dashboard snapshot={snapshot} data={data} state={state} act={act}/>}
    {section === 'quests' && <QuestCommandCenter data={state} serverAuthoritative onComplete={id => { void act('quest.complete', { id }); }} onCreate={draft => { void act('quest.create', questPayload(draft)); }} onUpdate={(id, draft) => { const q = state.quests.find(item => item.id === id); void act('quest.update', { ...questPayload(draft), id, expectedRevision: q ? revision('quests', q as unknown as HunterRow) : '0' }); }} onArchive={id => { const q = state.quests.find(item => item.id === id); if (q) void act('quest.archive', { id, expectedRevision: revision('quests', q as unknown as HunterRow) }); }} onRestore={id => { const q = state.quests.find(item => item.id === id); if (q) void act('quest.restore', { id, expectedRevision: revision('quests', q as unknown as HunterRow) }); }} onCreateArc={(title, description, targetDate) => { void act('arc.create', { title, description, targetDate }); }} onDeleteArc={id => { const a = state.arcs.find(item => item.id === id); if (a) void act('arc.delete', { id, expectedRevision: revision('arcs', a as unknown as HunterRow) }); }}/>
    }
    {section === 'create' && <QuestEditor data={state} act={act} revision={revision}/>}
    {section === 'arcs' && <ArcView data={state} act={act} revision={revision}/>}
    {section === 'core' && <Core snapshot={snapshot} data={data} state={state} act={act}/>}
    {section === 'operations' && <Operations snapshot={snapshot} data={data} state={state} act={act} revision={revision}/>}
    {section === 'lab' && <Lab data={data} act={act} revision={revision} hasUncertainCommand={cloud.hasUncertainCommand} error={cloud.error} retryCommand={cloud.retryCommand}/>}
    {reward && <Modal label={section === 'dashboard' ? 'Récompense de quête' : 'Quest reward'} onClose={() => setReward(null)}><div className="reward-modal"><div className="eyebrow">{section === 'dashboard' ? '[ NOTIFICATION DU SYSTÈME ]' : '[ SYSTEM NOTIFICATION ]'}</div><h2>{section === 'dashboard' ? 'QUÊTE VALIDÉE' : 'QUEST COMPLETE'}</h2><p>{reward.title}</p><div className="reward-xp">+{reward.xp} EXP</div><button className="continue-btn" onClick={() => setReward(null)}>{section === 'dashboard' ? 'CONTINUER' : 'CONTINUE'}</button></div></Modal>}
  </SystemShell>;
}

function Dashboard({ snapshot, data, state, act }: { snapshot: HunterSnapshot; data: Data; state: QuestSystemState; act: (kind: string, payload: HunterRow) => Promise<unknown> }) {
  const profile = data.profile, xp = num(data.system, 'totalXP'), progress = getHunterProgress(xp), level = Math.min(MAX_LEVEL, progress.level);
  const rank = rankForLevel(level), evolution = getCharacterEvolution(level), attributes = snapshot.derived?.attributeXP || {};
  const evolutionTitles: Record<string, string> = {
    'NEW HUNTER': 'NOUVEAU HUNTER', 'FIRST AWAKENING': 'PREMIER ÉVEIL', 'RISING HUNTER': 'HUNTER EN ASCENSION',
    'BLADE INITIATE': 'INITIÉ DE LA LAME', 'SHADOW DISCIPLE': 'DISCIPLE DES OMBRES', 'NIGHT WALKER': 'MARCHEUR DE NUIT',
    'SOUL FORGED': 'ÂME FORGÉE', 'DARK SENTINEL': 'SENTINELLE OBSCURE', 'PHANTOM KNIGHT': 'CHEVALIER FANTÔME',
    'ASTRAL HUNTER': 'HUNTER ASTRAL', 'ABYSS SEEKER': 'EXPLORATEUR DES ABÎMES', 'ECLIPSE WARDEN': "GARDIEN DE L'ÉCLIPSE",
    'VOID BLADE': 'LAME DU VIDE', 'CELESTIAL HUNTER': 'HUNTER CÉLESTE', 'STORM REVENANT': 'SPECTRE DE LA TEMPÊTE',
    'DUSK COMMANDER': 'COMMANDANT DU CRÉPUSCULE', 'SPECTRAL ASCENDANT': 'ASCENDANT SPECTRAL',
    'ETERNAL VANGUARD': 'AVANT-GARDE ÉTERNELLE', 'NIGHT EMPEROR': 'EMPEREUR DE LA NUIT',
    'SHADOW SOVEREIGN': 'SOUVERAIN DES OMBRES', 'FINAL ASCENSION': 'ASCENSION FINALE',
  };
  const attributeLabels: Record<string, string> = { focus: 'Concentration', discipline: 'Discipline', knowledge: 'Savoir', energy: 'Énergie', consistency: 'Régularité' };
  const difficultyLabels: Record<string, string> = { EASY: 'Facile', NORMAL: 'Normale', HARD: 'Difficile' };
  const serverDay = dayInZone(snapshot.serverTime,snapshot.timezone),
    daily = state.quests.filter(q => !q.archived && q.frequency === 'daily' && (!q.availableAfter || q.availableAfter <= serverDay) && (!serverDay || q.createdAt.slice(0,10) <= serverDay)),
    dailyStatus = daily.map(q => ({ quest:q, checked:state.completions.some(c => c.questId === q.id && c.period === serverDay) })),
    cleared = dailyStatus.filter(x => x.checked).length;
  const bosses = rows(data.extra, 'bosses').filter(b => !text(b, 'completedAt') && text(b, 'status').toLowerCase() !== 'completed' && b.completed !== true),
    timer = data.timer,
    sessions = rows(data.lab, 'sessions'),
    totalFocusMinutes = sessions.reduce((sum, session) => sum + num(session, 'minutes'), 0),
    recent = [...state.completions].sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, 4),
    formattedToday = snapshot.serverTime ? new Intl.DateTimeFormat('fr-FR', { timeZone: snapshot.timezone || 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(snapshot.serverTime)) : 'Aujourd’hui';
  const rankColor = { E: '#b8c6d5', D: '#79dfff', C: '#67ebd1', B: '#b49bff', A: '#ffd886', S: '#ff83a8' }[rank];
  const defs = [{ key: 'focus', label: attributeLabels.focus, Icon: Focus, color: '#44d6ff' }, { key: 'discipline', label: attributeLabels.discipline, Icon: Zap, color: '#ff6c92' },
    { key: 'knowledge', label: attributeLabels.knowledge, Icon: Brain, color: '#aa82fb' }, { key: 'energy', label: attributeLabels.energy, Icon: HeartPulse, color: '#4ce5b5' },
    { key: 'consistency', label: attributeLabels.consistency, Icon: Repeat2, color: '#ffc766' }];
  return <section className={premiumDashboard.dashboard} aria-label="Tableau de bord Hunter">
    <div className={premiumDashboard.pageHeading}>
      <div><h1>Votre ascension</h1><p><span className={premiumDashboard.liveDot} aria-hidden="true"/> {formattedToday} <span className={premiumDashboard.headingDivider}>/</span> {cleared} sur {daily.length} quêtes quotidiennes validées</p></div>
      <Link className={premiumDashboard.primaryAction} href="/quests/create"><Sparkles size={16} aria-hidden="true"/> Créer une quête <ArrowUpRight size={15} aria-hidden="true"/></Link>
    </div>

    <section className={premiumDashboard.hero} aria-label="Profil et progression Hunter">
      <div className={premiumDashboard.heroPortrait} style={{ '--hero-aura': evolution.aura } as React.CSSProperties}>
        {profile.avatar !== 'female'
          ? <Image src={evolution.image} alt="" fill priority sizes="(max-width: 700px) 100vw, 360px" className={premiumDashboard.heroImage}/>
          : <div className={premiumDashboard.portraitFallback}><UserRound size={58} strokeWidth={1.2} aria-hidden="true"/><span>CHASSEUR</span></div>}
        <span className={premiumDashboard.portraitIndex}>LQ / {String(level).padStart(2, '0')}</span>
      </div>
      <div className={premiumDashboard.heroContent}>
        <div className={premiumDashboard.heroTopline}><span className={premiumDashboard.signal}><span/> PROFIL DE CHASSEUR</span><span>FICHE DE PROGRESSION</span></div>
        <div className={premiumDashboard.identityRow}>
          <div className={premiumDashboard.identity}>
            <p>{evolutionTitles[evolution.title] || evolution.title} <span>·</span> ÉTAPE {String(evolution.stage).padStart(2, '0')}</p>
            <h2>{text(profile, 'name', 'Hunter')}</h2>
            <span className={premiumDashboard.levelLabel}><Crown size={14} aria-hidden="true"/> NIVEAU {String(level).padStart(2, '0')}</span>
          </div>
          <div className={premiumDashboard.rankSeal} style={{ '--rank-color': rankColor } as React.CSSProperties} aria-label={'Rang Hunter ' + rank}><span>RANG</span><strong>{rank}</strong></div>
        </div>
        <HunterClassIdentity classCode={profile.classCode} profileRevision={text(profile, 'revision', '0')} variant="dashboard"
          onSelect={async (classCode, expectedRevision) => Boolean(await act('profile.class.select', { classCode, expectedRevision }))}/>
        <div className={premiumDashboard.xpBlock}>
          <div className={premiumDashboard.xpMeta}><span>VERS LE NIVEAU {Math.min(MAX_LEVEL, level + 1)}</span><strong>{Math.floor(progress.current).toLocaleString('fr-FR')} <span>/ {progress.required.toLocaleString('fr-FR')} XP</span></strong></div>
          <div className={premiumDashboard.xpTrack} role="progressbar" aria-label="Progression vers le niveau suivant" aria-valuemin={0} aria-valuemax={progress.required || 1} aria-valuenow={progress.current} aria-valuetext={Math.floor(progress.current) + ' sur ' + progress.required + ' XP'}><span style={{ width: progress.percent + '%' }}/></div>
          <div className={premiumDashboard.heroFoot}><span><Zap size={14} aria-hidden="true"/> {xp.toLocaleString('fr-FR')} XP cumulés</span><span>{Math.max(0, progress.required - Math.floor(progress.current)).toLocaleString('fr-FR')} XP restants</span></div>
        </div>
      </div>
    </section>

    <div className={premiumDashboard.commandGrid}>
      <section className={premiumDashboard.questPanel} aria-labelledby="dashboard-quests-title">
        <header className={premiumDashboard.panelHeader}><div><span className={premiumDashboard.sectionMark}>01 / QUOTIDIEN</span><h2 id="dashboard-quests-title"><Target size={17} aria-hidden="true"/> Quêtes du jour</h2></div><span className={premiumDashboard.panelCount} aria-label={cleared + ' sur ' + daily.length + ' quêtes terminées'}>{cleared.toString().padStart(2,'0')} <i>/</i> {daily.length.toString().padStart(2,'0')}</span></header>
        <div className={premiumDashboard.questList}>{dailyStatus.length ? dailyStatus.slice(0, 5).map(({ quest, checked }, index) => <button type="button" key={quest.id} className={premiumDashboard.questRow + (checked ? ' ' + premiumDashboard.questDone : '')} disabled={checked} aria-pressed={checked} aria-label={checked ? quest.title + ', terminée' : 'Valider la quête ' + quest.title} onClick={() => void act('quest.complete', { id: quest.id })}>
          <span className={premiumDashboard.questNumber}>{String(index + 1).padStart(2, '0')}</span><span className={premiumDashboard.questCheck} aria-hidden="true">{checked && <Check size={14} strokeWidth={2.5}/>}</span><span className={premiumDashboard.questText}><strong>{quest.title}</strong><small>{attributeLabels[quest.attribute.toLowerCase()] || quest.attribute} <i>·</i> {difficultyLabels[quest.difficulty.toUpperCase()] || quest.difficulty}</small></span><ChevronRight size={15} className={premiumDashboard.questArrow} aria-hidden="true"/>
        </button>) : <div className={premiumDashboard.emptyState}><span className={premiumDashboard.emptyGlyph}><Target size={19}/></span><p>Aucune quête quotidienne active.</p><Link href="/quests/create">Préparer une quête <ArrowUpRight size={13}/></Link></div>}</div>
        <Link className={premiumDashboard.panelLink} href="/quests">Ouvrir le journal des quêtes <ArrowUpRight size={14} aria-hidden="true"/></Link>
      </section>

      <section className={premiumDashboard.bossPanel} aria-labelledby="dashboard-boss-title">
        <header className={premiumDashboard.panelHeader}><div><span className={premiumDashboard.sectionMark}>02 / CAP LONG</span><h2 id="dashboard-boss-title"><Swords size={17} aria-hidden="true"/> Boss actif</h2></div><span className={premiumDashboard.violetSignal}>OPÉRATIONS</span></header>
        {bosses.length ? <div className={premiumDashboard.bossList}>{bosses.slice(0, 2).map(boss => {
          const goals = rows(boss, 'subObjectives'), totalWeight = goals.reduce((sum, goal) => sum + num(goal, 'weight'), 0), completedWeight = goals.reduce((sum, goal) => sum + (goal.completed === true ? num(goal, 'weight') : 0), 0), percent = totalWeight ? Math.round(completedWeight / totalWeight * 100) : 0;
          const nextGoal = goals.find(goal => goal.completed !== true);
          return <article className={premiumDashboard.bossCard} key={text(boss, 'id')}>
            <div className={premiumDashboard.bossTitle}><span className={premiumDashboard.bossSigil}><Swords size={18} aria-hidden="true"/></span><div><h3>{text(boss, 'title', 'Mission Boss')}</h3><p>{goals.filter(goal => goal.completed === true).length} / {goals.length} objectifs validés</p></div><strong>{percent}%</strong></div>
            <div className={premiumDashboard.bossTrack} role="progressbar" aria-label={'Progression de ' + text(boss, 'title')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: percent + '%' }}/></div>
            {nextGoal && <p className={premiumDashboard.bossNext}><span>PROCHAINE ÉTAPE</span>{text(nextGoal, 'title')}</p>}
          </article>;
        })}</div> : <div className={premiumDashboard.emptyBoss}><span className={premiumDashboard.bossSigil}><Swords size={16} aria-hidden="true"/></span><div><strong>Aucun Boss en cours</strong><p>Un objectif ambitieux se construit étape par étape.</p></div></div>}
        <Link className={premiumDashboard.panelLink} href="/hunter-operations">Voir les opérations <ArrowUpRight size={14} aria-hidden="true"/></Link>
      </section>

      <div className={premiumDashboard.progressGrid}>
      <section className={premiumDashboard.focusPanel} aria-labelledby="dashboard-focus-title">
        <header className={premiumDashboard.panelHeader}><div><span className={premiumDashboard.sectionMark}>03 / CONCENTRATION</span><h2 id="dashboard-focus-title"><Focus size={17} aria-hidden="true"/> Concentration</h2></div><span className={premiumDashboard.focusOrb} aria-hidden="true"><span/></span></header>
        <div className={premiumDashboard.focusContent}>
          <div className={premiumDashboard.focusTimer}>{timer && text(timer, 'status') !== 'idle' ? <><strong>{String(Math.floor(num(timer, 'remainingSeconds') / 60)).padStart(2, '0')}:{String(num(timer, 'remainingSeconds') % 60).padStart(2, '0')}</strong><span>{text(timer, 'status') === 'running' ? 'SESSION EN COURS' : 'SESSION EN PAUSE'}</span></> : <><strong>{totalFocusMinutes.toLocaleString('fr-FR')}<small> min</small></strong><span>TEMPS DE CONCENTRATION ENREGISTRÉ</span></>}</div>
          <p>{timer && text(timer, 'status') !== 'idle' ? text(timer, 'label', 'Séance de concentration') : 'Le prochain bloc de concentration commence ici.'}</p>
        </div>
        <Link className={premiumDashboard.focusAction} href="/hunter-lab?tab=focus">{timer && text(timer, 'status') === 'running' ? 'Rejoindre la session' : 'Ouvrir Focus'} <ArrowUpRight size={14} aria-hidden="true"/></Link>
      </section>

      <section className={premiumDashboard.attributePanel} aria-labelledby="dashboard-attributes-title">
        <header className={premiumDashboard.panelHeader}><div><span className={premiumDashboard.sectionMark}>04 / ATTRIBUTS</span><h2 id="dashboard-attributes-title"><Shield size={17} aria-hidden="true"/> Attributs Hunter</h2></div><Link className={premiumDashboard.miniLink} href="/hunter-core">Détails <ArrowUpRight size={12}/></Link></header>
        <div className={premiumDashboard.attributeList}>{defs.map(({ key, label, Icon, color }) => {
          const value = Number(attributes[key] || 0), scale = Math.max(100, ...Object.values(attributes).map(Number)), formatted = value.toLocaleString('fr-FR');
          return <div className={premiumDashboard.attributeRow} key={key}>
            <div className={premiumDashboard.attributeLabel}><Icon size={15} style={{ color }} aria-hidden="true"/><span>{label}</span></div>
            <div className={premiumDashboard.attributeTrack} role="meter" aria-label={label + ' XP'} aria-valuemin={0} aria-valuemax={scale} aria-valuenow={value} aria-valuetext={formatted + ' XP'}><span style={{ width: Math.min(100, Math.round(value / scale * 100)) + '%', background: color }}/></div>
            <strong>{formatted}<small> XP</small></strong>
          </div>;
        })}</div>
        <p className={premiumDashboard.attributeNote}>XP par attribut · échelle commune</p>
      </section>

      </div>

      <section className={premiumDashboard.activityPanel} aria-labelledby="dashboard-activity-title">
        <header className={premiumDashboard.panelHeader}><div><span className={premiumDashboard.sectionMark}>05 / ACTIVITÉ RÉCENTE</span><h2 id="dashboard-activity-title"><Activity size={17} aria-hidden="true"/> Activité récente</h2></div><Link className={premiumDashboard.miniLink} href="/hunter-core">Historique <ArrowUpRight size={12}/></Link></header>
        {recent.length ? <ol className={premiumDashboard.activityList}>{recent.map((item, index) => <li key={item.id}>
          <span className={premiumDashboard.activityLine} aria-hidden="true"><i className={index === 0 ? premiumDashboard.activityLatest : ''}/></span><span className={premiumDashboard.activityIcon}><Zap size={14} aria-hidden="true"/></span><span className={premiumDashboard.activityText}><strong>{item.questTitle || item.questId}</strong><small>{new Date(item.completedAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: snapshot.timezone || 'UTC' })}</small></span><b>+{item.xpAwarded.toLocaleString('fr-FR')} <small>XP</small></b>
        </li>)}</ol> : <div className={premiumDashboard.emptyActivity}><Clock3 size={17} aria-hidden="true"/><span>Les validations confirmées apparaîtront ici.</span></div>}
      </section>
    </div>
  </section>;
}

function QuestEditor({ data, act, revision }: { data: QuestSystemState; act: (kind: string, payload: HunterRow) => Promise<unknown>; revision: (bucket: string, row: HunterRow) => string }) {
  const router = useRouter(), search = useSearchParams(), editId = search.get('edit'), quest = data.quests.find(q => q.id === editId && !q.archived);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (saving) return; setSaving(true); setError(''); const f = new FormData(event.currentTarget), frequency = String(f.get('frequency'));
    const payload: HunterRow = { title: String(f.get('title') || ''), description: String(f.get('description') || ''), frequency, difficulty: String(f.get('difficulty')), attribute: String(f.get('attribute')), arcId: String(f.get('arcId') || '') || null, targetDate: frequency === 'once' ? String(f.get('targetDate') || '') || null : null };
    if (quest) { payload.id = quest.id; payload.expectedRevision = revision('quests', quest as unknown as HunterRow); }
    const result = await act(quest ? 'quest.update' : 'quest.create', payload); if (result) router.push('/quests'); else { setError('The command was not confirmed. Please try again.'); setSaving(false); }
  }
  if (editId && !quest) return <div className={questUI.formCard}><h2>QUEST NOT FOUND</h2><Link className={questUI.link} href="/quests">RETURN TO QUEST LOG</Link></div>;
  return <div className={questUI.formCard}><h2>{quest ? 'MODIFY QUEST' : 'REGISTER NEW QUEST'}</h2><p>Rewards follow the difficulty. The server verifies each completion.</p><form className={questUI.form} onSubmit={submit}><label>QUEST NAME<input name="title" required maxLength={100} defaultValue={quest?.title || ''}/></label><label>DESCRIPTION<input name="description" maxLength={250} defaultValue={quest?.description || ''}/></label><div className={questUI.two}><label>FREQUENCY<select name="frequency" defaultValue={quest?.frequency || 'daily'}>{[['daily','DAILY QUEST'],['weekly','WEEKLY QUEST'],['monthly','MONTHLY QUEST'],['once','SPECIAL QUEST']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label><label>ATTRIBUTE<select name="attribute" defaultValue={quest?.attribute || 'discipline'}>{['focus','discipline','knowledge','energy','consistency'].map(x => <option key={x} value={x}>{x.toUpperCase()}</option>)}</select></label></div><div className={questUI.two}><label>DIFFICULTY<select name="difficulty" defaultValue={quest?.difficulty || 'NORMAL'}><option value="EASY">EASY</option><option value="NORMAL">NORMAL</option><option value="HARD">HARD</option></select></label><label>EXP REWARD<input readOnly value={{ EASY:30, NORMAL:50, HARD:80 }[quest?.difficulty || 'NORMAL']}/></label></div><label>STORY ARC<select name="arcId" defaultValue={quest?.arcId || ''}><option value="">NO ARC</option>{data.arcs.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label>{quest?.frequency === 'once' && <label>AVAILABLE FROM<input name="targetDate" type="date" defaultValue={quest.targetDate || ''}/></label>}{error && <p role="alert" className={questUI.danger}>{error}</p>}<div className={questUI.dialogActions}><Link className={questUI.link} href="/quests">CANCEL</Link><button className={questUI.primary} disabled={saving}>{saving ? 'SAVING...' : quest ? 'SAVE QUEST' : 'CREATE QUEST'}</button></div></form><div className={questUI.tip}>Reward values and completion periods are verified by the server.</div></div>;
}

function ArcView({ data, act, revision }: { data: QuestSystemState; act: (kind: string, payload: HunterRow) => Promise<unknown>; revision: (bucket: string, row: HunterRow) => string }) {
  async function create(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const form=e.currentTarget, f = new FormData(form), ok = await act('arc.create', { title: String(f.get('title')), description: String(f.get('description') || ''), targetDate: String(f.get('targetDate')) }); if (ok) form.reset(); }
  return <><section className={questUI.panel}><div className={questUI.header}><div><span className={questUI.kicker}>[ MAIN QUEST // STORY ARC ]</span><h2>CREATE STORY ARC</h2><p>Construis un objectif allant jusqu’à deux ans.</p></div></div><form className={questUI.form} onSubmit={create}><label>ARC TITLE<input name="title" maxLength={90} required/></label><label>DESCRIPTION<input name="description" maxLength={220}/></label><label>TARGET DATE<input name="targetDate" type="date" required/></label><button className={questUI.primary}>CREATE ARC</button></form></section><section className={questUI.panel}><div className={questUI.header}><div><span className={questUI.kicker}>[ ACTIVE STORY ARCS ]</span><h2>MAIN QUESTS</h2></div><Link href="/quests/create" className={questUI.link}>+ CREATE QUEST</Link></div>{!data.arcs.length ? <p className={questUI.empty}>NO STORY ARCS YET</p> : <div className={questUI.arcs}>{data.arcs.map(a => <article className={questUI.arc} key={a.id}><BookOpen size={20}/><div><strong>{a.title}</strong><p>{a.description || 'MAIN QUEST'}</p><small>TARGET: {a.targetDate} - {data.quests.filter(q => !q.archived && q.arcId === a.id).length} QUESTS</small></div><button aria-label={'Delete ' + a.title} onClick={() => { if (window.confirm('Delete ' + a.title + '? Linked quests will be detached.')) void act('arc.delete', { id: a.id, expectedRevision: revision('arcs', a as unknown as HunterRow) }); }}><Trash2 size={16}/></button></article>)}</div>}</section></>;
}

function Core({ snapshot, data, state, act }: { snapshot: HunterSnapshot; data: Data; state: QuestSystemState; act: (kind: string, payload: HunterRow) => Promise<unknown> }) {
  const xp = num(data.system, 'totalXP'), progress = getHunterProgress(xp), focus = rows(data.lab, 'sessions').reduce((s,r) => s + num(r,'minutes'), 0), bosses = rows(data.extra,'bosses').filter(r => !!r.completedAt).length;
  const attrs = snapshot.derived?.attributeXP || {};
  return <section className={coreStyles.page}><header><span className={coreStyles.eyebrow}>[ LIFEQUEST // CORE v011 ]</span><h1>HUNTER SYSTEM ENGINE</h1><p>Progression commune, statistiques réelles et historique Hunter.</p></header><div className={coreStyles.tiles}><article><span>LEVEL</span><strong>{progress.level}</strong><small>{Math.round(progress.current)} / {progress.required} EXP vers le suivant</small></article><article><span>TOTAL EXP</span><strong>{xp.toLocaleString('fr-FR')}</strong><small>Somme de toutes les activités</small></article><article><span>HUNTER STABILITY</span><strong>{num(data.settings,'stability',100)}%</strong><small>Pénalités désactivées : repos sans perte</small></article><article><span>STREAK</span><strong>{new Set(state.completions.map(c => c.completedAt.slice(0,10))).size} J</strong><small>Bonus actuel calculé sur les validations enregistrées</small></article></div><div className={coreStyles.grid}><HunterClassIdentity classCode={data.profile.classCode} profileRevision={text(data.profile, 'revision', '0')} variant="core" onSelect={async (classCode, expectedRevision) => Boolean(await act('profile.class.select', { classCode, expectedRevision }))}/><section className={coreStyles.panel}><h2>REAL PLAYER ATTRIBUTES</h2><p>EXP réellement crédités dans chaque discipline.</p>{Object.entries(attrs).map(([name,value]) => <div className={coreStyles.attr} key={name}><span>{name.toUpperCase()}</span><div className={coreStyles.track}><div style={{width: Math.min(100, Number(value) / Math.max(100,...Object.values(attrs).map(Number)) * 100) + '%'}}/></div><b>{value} XP</b></div>)}</section><section className={coreStyles.panel}><h2>CORE OPERATIONS</h2><p>FOCUS : {focus} minutes enregistrées</p><p>BOSS CLEARED : {bosses}</p><p>Rang {snapshot.derived?.rank} calculé dans le snapshot.</p><nav className={coreStyles.links}><Link href="/hunter-lab">FOCUS DUNGEON</Link><Link href="/hunter-operations">BOSS MISSIONS</Link><Link href="/dashboard">STATUS WINDOW</Link></nav></section><section className={coreStyles.panel}><h2>SAVE & RESTORE</h2><p>Les comptes connectés sont conservés dans PostgreSQL. Les sauvegardes du navigateur ne sont pas utilisées.</p><div className={coreStyles.actions}><button disabled>EXPORT JSON — INDISPONIBLE</button><button disabled>IMPORT JSON — INDISPONIBLE</button></div><small>L’import cloud nécessite une commande serveur dédiée.</small></section><section className={coreStyles.panel}><h2>RECENT EXP HISTORY</h2><div className={coreStyles.log}>{state.completions.slice(-15).reverse().map(c => <div key={c.id}><span>{c.questId.startsWith('lifequest:activity:') ? c.questId.split(':')[2].toUpperCase() : 'QUEST'}</span><small>{new Date(c.completedAt).toLocaleDateString('fr-FR')}</small><strong>+{c.xpAwarded} EXP</strong></div>)}</div></section></div></section>;
}

function Operations({ snapshot, data, state, act, revision }: { snapshot: HunterSnapshot; data: Data; state: QuestSystemState; act: (kind:string,payload:HunterRow)=>Promise<unknown>; revision:(bucket:string,row:HunterRow)=>string }) {
  const level = getHunterProgress(num(data.system,'totalXP')).level, bosses = rows(data.extra,'bosses'), events = rows(data.extra,'events'), [filter,setFilter] = useState('all');
  const unlockedRows = hunterRows(data.system.achievements), unlocked = new Set(unlockedRows.map(x => text(x,'id'))), earned = achievementProgress(state,level);
  return <section className={operations.root}><div className={operations.banner}><div><span className={operations.kicker}>[ SYSTEM // OPERATIONS ]</span><h1>HUNTER COMMAND CENTER</h1><p>LEVEL {level}  RANK {snapshot.derived?.rank}  {state.completions.length} QUESTS CLEARED</p></div><div><Link href="/hunter-core">HUNTER CORE →</Link> · <Link href="/dashboard">RETURN TO STATUS WINDOW →</Link></div></div><div className={operations.grid}>
    <section className={operations.panel}><h2>BOSS BATTLES</h2><p>Découpe ton défi en sous-objectifs. Leur poids représente leur part de la progression. Tous doivent être validés pour recevoir la récompense finale.</p><BossCreate act={act}/>{bosses.map(b => {const goals=rows(b,'subObjectives'),weight=goals.reduce((sum,g)=>sum+num(g,'weight'),0),done=goals.reduce((sum,g)=>sum+(g.completed===true?num(g,'weight'):0),0),percent=weight?Math.round(done/weight*100):0,completed=!!text(b,'completedAt')||text(b,'status').toLowerCase()==='completed'||b.completed===true,credited=text(b,'rewardStatus')==='credited',resolved=text(b,'rewardStatus')==='resolved_without_xp';return <article className={operations.item} key={text(b,'id')}><strong>{text(b,'title')}</strong><small>{completed?'TERMINÉ':'EN COURS'} · {percent}% · Récompense : {text(b,'xp')} EXP de base</small><div className={operations.track} role="progressbar" aria-label={'Progression de '+text(b,'title')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><div style={{width:percent+'%'}}/></div>{goals.length>0&&<ul className={operations.subObjectives}>{goals.map(s=><li key={text(s,'id')}><span>{text(s,'title')} · poids {text(s,'weight')}</span><button type="button" className={operations.small} disabled={s.completed===true||completed} onClick={()=>void act('boss.progress',{id:text(b,'id'),subId:text(s,'id'),expectedRevision:revision('bosses',b)})}>{s.completed?'VALIDÉ':'VALIDER : '+text(s,'title')}</button></li>)}</ul>}{completed&&(resolved?<small>RÉSOLU SANS XP</small>:credited?<small>EXP CRÉDITÉS</small>:<button type="button" className={operations.small} onClick={()=>void act('boss.claim',{id:text(b,'id'),expectedRevision:revision('bosses',b)})}>{num(b,'xp')===0?'FINALISER SANS XP':'RÉCUPÉRER LES EXP'}</button>)}</article>})}</section>
    <section className={operations.panel}><span className={operations.kicker}>[ SYSTEM ACHIEVEMENTS ]</span><h2>HUNTER TITLES</h2><p>Titres débloqués une seule fois, conservés après les jours de repos. Aucune récompense EXP supplémentaire.</p><div className={operations.achievements}>{earned.map(a => {const row=unlockedRows.find(x=>text(x,'id')===a.id),isUnlocked=unlocked.has(a.id);return <div className={operations.achievement + (isUnlocked ? ' '+operations.unlocked : '')} key={a.id}><strong>{isUnlocked?'◆ ':'◇ '}{a.title}</strong><small>{a.criterion}</small><small>{isUnlocked?'UNLOCKED':Math.min(a.progress,a.target)+' / '+a.target}</small>{row&&<small>Débloqué le {new Date(text(row,'unlockedAt')).toLocaleDateString('fr-FR')}</small>}</div>})}</div><button className={operations.small} onClick={() => void act('achievement.sync',{})}>SYNCHRONISER LES TITRES</button></section>
    <section className={operations.panel}><span className={operations.kicker}>[ MAIN QUESTS ]</span><h2>STORY ARCS PROGRESS</h2><Link href="/arcs">MANAGE STORY ARCS</Link>{state.arcs.map(a => <article className={operations.item} key={a.id}><strong>{a.title}</strong><small>TARGET {a.targetDate}  {state.quests.filter(q=>!q.archived&&q.arcId===a.id).length} QUESTS</small></article>)}</section>
    <section className={operations.panel}><span className={operations.kicker}>[ HUNTER ARCHIVE ]</span><h2>ACTIVITY HISTORY</h2><p>{state.completions.length} QUEST COMPLETIONS  {num(data.system,'totalXP').toLocaleString()} TOTAL EXP</p><label className={operations.filter}>STORY ARC <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">ALL QUESTS</option>{state.arcs.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}</select></label><div className={operations.history}>{state.completions.filter(c=>filter==='all'||c.arcId===filter).slice().reverse().slice(0,100).map(c=><article className={operations.historyItem} key={c.id}><div><strong>{c.questTitle||c.questId}</strong><small>{new Date(c.completedAt).toLocaleString('fr-FR')}</small></div><span>+{c.xpAwarded} EXP</span></article>)}</div><h3>SYSTEM EVENTS</h3>{events.slice(-15).reverse().map(e=><div className={operations.event} key={text(e,'id')}>{text(e,'title')} <small>{text(e,'at')}</small></div>)}</section>
  </div></section>;
}
function BossCreate({act}:{act:(kind:string,payload:HunterRow)=>Promise<unknown>}) {
  const [goals,setGoals]=useState([{id:'goal-1',title:'',weight:1}]);
  const total=goals.reduce((sum,goal)=>sum+(Number.isFinite(goal.weight)?goal.weight:0),0);
  return <form className={operations.form} onSubmit={async e=>{e.preventDefault();const element=e.currentTarget,form=new FormData(element);if(await act('boss.create',{title:String(form.get('title')||''),subObjectives:goals.map(({title,weight})=>({title,weight}))})){element.reset();setGoals([{id:crypto.randomUUID(),title:'',weight:1}]);}}}>
    <label>TITRE DU BOSS<input name="title" required maxLength={80}/></label>
    {goals.map((goal,index)=><fieldset key={goal.id} className={operations.subObjectiveForm}><legend>Sous-objectif {index+1}</legend><label>OBJECTIF<input required maxLength={120} value={goal.title} onChange={e=>setGoals(items=>items.map(item=>item.id===goal.id?{...item,title:e.target.value}:item))}/></label><label>POIDS<input type="number" required min={1} max={1000} step={1} value={goal.weight} onChange={e=>setGoals(items=>items.map(item=>item.id===goal.id?{...item,weight:Number(e.target.value)}:item))}/></label>{goals.length>1&&<button type="button" onClick={()=>setGoals(items=>items.filter(item=>item.id!==goal.id))}>RETIRER</button>}</fieldset>)}
    <button type="button" disabled={goals.length>=20} onClick={()=>setGoals(items=>[...items,{id:crypto.randomUUID(),title:'',weight:1}])}>AJOUTER UN SOUS-OBJECTIF</button><small>Poids total : {total}/1000 · La récompense est calculée par le serveur.</small><button disabled={!total||total>1000}>REGISTER BOSS</button>
  </form>;
}

function Lab({data,act,revision,hasUncertainCommand,error,retryCommand}:{data:Data;act:(kind:string,payload:HunterRow)=>Promise<unknown>;revision:(bucket:string,row:HunterRow)=>string;hasUncertainCommand:boolean;error:string;retryCommand:()=>Promise<unknown>}) {
  type Tab='focus'|'ideas'|'creative'|'mind'|'library'|'journal'|'analytics';
  const today=useLocalDay();
  const [tab,setTab]=useState<Tab>('focus'),[idea,setIdea]=useState(''),[content,setContent]=useState(''),[tag,setTag]=useState('General'),[node,setNode]=useState(''),[parent,setParent]=useState(''),[resource,setResource]=useState(''),[resourceTopic,setResourceTopic]=useState('General'),[notes,setNotes]=useState(''),[url,setUrl]=useState(''),[date,setDate]=useState(''),[answer,setAnswer]=useState(''),[promptIndex,setPromptIndex]=useState(0);
  const lab=data.lab,sessions=rows(lab,'sessions'),timer=data.timer,ideas=rows(lab,'ideas'),nodes=rows(lab,'nodes'),resources=rows(lab,'resources'),journal=rows(lab,'journal'),challenges=rows(lab,'challenges');
  const journalDate=date||today,journalEntry=journal.find(entry=>text(entry,'date')===journalDate);
  const analytics=useMemo(()=>{
    const total=sessions.reduce((n,s)=>n+num(s,'minutes'),0);
    const days=new Set(sessions.map(s=>{const d=new Date(text(s,'date'));return Number.isFinite(d.getTime())?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:''}).filter(Boolean));
    const anchor=today?new Date(`${today}T12:00:00`):null;
    const past=anchor?Array.from({length:7},(_,i)=>{
      const d=new Date(anchor);d.setDate(d.getDate()-(6-i));
      const day=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const minutes=sessions.filter(s=>{const x=new Date(text(s,'date'));return Number.isFinite(x.getTime())&&`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`===day}).reduce((n,s)=>n+num(s,'minutes'),0);
      return{day,minutes};
    }):[];
    return{total,days:days.size,past,max:Math.max(25,...past.map(x=>x.minutes))};
  },[sessions,today]);
  const challengePrompt=PROMPTS[promptIndex]||PROMPTS[0];
  const tabs:{id:Tab;label:string;Icon:typeof BrainCircuit}[]=[{id:'focus',label:'FOCUS DUNGEON',Icon:BrainCircuit},{id:'ideas',label:'IDEA VAULT',Icon:Lightbulb},{id:'creative',label:'CREATIVITY',Icon:Sparkles},{id:'mind',label:'MIND MAP',Icon:Network},{id:'library',label:'LIBRARY',Icon:BookOpen},{id:'journal',label:'JOURNAL',Icon:NotebookPen},{id:'analytics',label:'ANALYTICS',Icon:Brain}];
  const send=(kind:string,payload:HunterRow)=>act(kind,payload);
  return <section className={labStyles.page}><header className={labStyles.intro}><div><div className={labStyles.eyebrow}>[ SYSTEM // HUNTER LAB ]</div><h1>PRODUCTIVITY & CREATIVITY</h1><p>Sept outils pour entraîner ton attention, tes idées et tes compétences.</p></div><Link href="/dashboard" className={labStyles.back}>STATUS WINDOW</Link></header><nav className={labStyles.tabs} aria-label="Hunter Lab modules">{tabs.map(({id,label,Icon})=><button type="button" key={id} className={labStyles.tab+' '+(tab===id?labStyles.active:'')} aria-pressed={tab===id} onClick={()=>setTab(id)}><Icon size={17}/>{label}</button>)}</nav>
    {tab==='focus'&&<section className={labStyles.panel}><h2><Clock3/> [ FOCUS DUNGEON ]</h2><p>The timer and session end are controlled by PostgreSQL.</p><FocusQuestLink timer={timer} sessions={sessions} quests={rows(data.system,'quests')} bosses={rows(data.extra,'bosses')} error={error} hasUncertainCommand={hasUncertainCommand} revision={row=>revision('sessions',row)} onCommand={send} onRetry={retryCommand}/></section>}
    {tab==='ideas'&&<section className={labStyles.panel}><h2><Lightbulb/> [ IDEA VAULT ]</h2><div className={labStyles.form}><input aria-label="Idea title" placeholder="Idea title" value={idea} onChange={e=>setIdea(e.target.value)}/><input aria-label="Tag" value={tag} onChange={e=>setTag(e.target.value)}/><textarea aria-label="Contenu" rows={4} value={content} onChange={e=>setContent(e.target.value)}/><button className={labStyles.primary} onClick={async()=>{if(await send('idea.create',{title:idea,content,tag})){setIdea('');setContent('')}}}>SAVE IDEA</button></div><div className={labStyles.cardGrid}>{ideas.map(r=><article className={labStyles.item} key={text(r,'id')}><small>{text(r,'tag')}</small><h3>{text(r,'title')}</h3><p>{text(r,'content')}</p><div className={labStyles.actions}><button className={labStyles.secondary} onClick={()=>void send('idea.set_archived',{id:text(r,'id'),expectedRevision:revision('ideas',r),archived:r.archived!==true})}>{r.archived?'RESTORE':'ARCHIVE'}</button><button className={labStyles.danger} onClick={()=>void send('idea.delete',{id:text(r,'id'),expectedRevision:revision('ideas',r)})}><Trash2 size={16}/></button></div></article>)}</div></section>}
    {tab==='mind'&&<section className={labStyles.panel}><h2><Network/> [ MIND MAP ]</h2><p className={labStyles.hint}>Crée des nœuds reliés par une idée parente. Clique sur un nœud pour en faire la prochaine branche.</p><div className={labStyles.formLine}><input aria-label="Nouvelle branche" value={node} onChange={e=>setNode(e.target.value)} placeholder="Nouvelle idée / branche"/><select aria-label="Parent idea" value={parent} onChange={e=>setParent(e.target.value)}><option value="">Racine</option>{nodes.map(n=><option key={text(n,'id')} value={text(n,'id')}>{text(n,'title')}</option>)}</select><button className={labStyles.primary} disabled={!node.trim()} onClick={async()=>{if(await send('node.create',{title:node,parentId:parent||null}))setNode('')}}>ADD NODE</button></div><MindCanvas nodes={nodes} selected={parent} onChoose={setParent} title={text}/><MindMapBossPreview nodes={nodes} bosses={rows(data.extra,'bosses')} selectedParentId={parent} revision={revision} onCommand={send} onRetry={retryCommand} hasUncertainCommand={hasUncertainCommand} error={error}/><div className={labStyles.nodeList}>{nodes.map(n=><div className={labStyles.nodeRow} key={text(n,'id')}><strong>{text(n,'title')}</strong><span>{n.parentId?'CHILD OF '+text(nodes.find(x=>text(x,'id')===text(n,'parentId')),'title','Parent'):'ROOT'}</span><button aria-label={'Delete '+text(n,'title')} className={labStyles.danger} onClick={()=>void send('node.delete',{id:text(n,'id'),expectedRevision:revision('nodes',n)})}><Trash2 size={15}/></button></div>)}</div></section>}
    {tab==='library'&&<section className={labStyles.panel}><h2><BookOpen/> [ KNOWLEDGE LIBRARY ]</h2><div className={labStyles.form}><input aria-label="Notion ou ressource" placeholder="Notion / ressource" value={resource} onChange={e=>setResource(e.target.value)}/><input aria-label="Sujet" placeholder="Sujet" value={resourceTopic} onChange={e=>setResourceTopic(e.target.value)}/><input aria-label="Lien de la ressource" placeholder="Lien facultatif https://..." value={url} onChange={e=>setUrl(e.target.value)}/><textarea aria-label="Notes et enseignements" rows={3} placeholder="Notes et enseignements" value={notes} onChange={e=>setNotes(e.target.value)}/><button className={labStyles.primary} onClick={async()=>{if(await send('resource.create',{title:resource,notes,url,topic:resourceTopic})){setResource('');setNotes('');setUrl('')}}}>SAVE KNOWLEDGE</button></div><div className={labStyles.cardGrid}>{resources.map(r=><article className={labStyles.item} key={text(r,'id')}><small>{text(r,'topic')} - {r.mastered?'MASTERED':'LEARNING'}</small><h3>{text(r,'title')}</h3><p>{text(r,'notes')}</p>{text(r,'url')&&<a href={text(r,'url')} target="_blank" rel="noreferrer">OPEN RESOURCE</a>}<div className={labStyles.actions}><button className={labStyles.secondary} onClick={()=>void send('resource.set_mastered',{id:text(r,'id'),expectedRevision:revision('resources',r),mastered:r.mastered!==true})}>{r.mastered?'MARK LEARNING':'MARK MASTERED'}</button><button className={labStyles.danger} onClick={()=>void send('resource.delete',{id:text(r,'id'),expectedRevision:revision('resources',r)})}>DELETE</button></div></article>)}</div></section>}
    {tab==='journal'&&<section className={labStyles.panel}><h2><NotebookPen/> [ HUNTER JOURNAL ]</h2><label className={labStyles.field}>DATE DU JOURNAL<input type="date" max={today||undefined} value={journalDate} onChange={e=>setDate(e.target.value)}/></label><p className={labStyles.hint}>Bilan du {journalDate} — une entrée par jour, modifiable.</p><form key={journalDate+text(journalEntry,'id')} className={labStyles.form} onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await send('journal.save',{date:journalDate,wins:String(f.get('wins')||''),challenges:String(f.get('challenges')||''),gratitude:String(f.get('gratitude')||''),tomorrow:String(f.get('tomorrow')||''),expectedRevision:journalEntry?revision('journal',journalEntry):null})}}>{['wins','challenges','gratitude','tomorrow'].map(x=><label className={labStyles.field} key={x}>{x.toUpperCase()}<textarea name={x} rows={2} defaultValue={text(journalEntry,x)}/></label>)}<button className={labStyles.primary}>SAVE DAILY JOURNAL</button></form>{journal.map(j=><article className={labStyles.item} key={text(j,'id')}><small>{text(j,'date')}</small><h3>HUNTER LOG</h3><p><b>Victories:</b> {text(j,'wins')}</p><p><b>Challenges:</b> {text(j,'challenges')}</p><p><b>Gratitude:</b> {text(j,'gratitude')}</p><p><b>Tomorrow:</b> {text(j,'tomorrow')}</p></article>)}</section>}
    {tab==='creative'&&<section className={labStyles.panel}><h2><Sparkles/> [ CREATIVITY DUNGEON ]</h2><div className={labStyles.challenge}><small>DAILY CREATIVE CHALLENGE</small><h3>{challengePrompt}</h3><button className={labStyles.secondary} onClick={()=>{setPromptIndex(index=>(index+1)%PROMPTS.length);setAnswer('')}}>NEW CHALLENGE</button></div><textarea aria-label="Réponse au défi créatif" value={answer} onChange={e=>setAnswer(e.target.value)} rows={6} placeholder="Ta réponse créative..."/><div className={labStyles.actions}><button className={labStyles.primary} disabled={!answer.trim()} onClick={async()=>{if(await send('creativity.submit',{prompt:challengePrompt,response:answer})){setAnswer('');setPromptIndex(index=>(index+1)%PROMPTS.length)}}}>SUBMIT CREATION</button><span>{challenges.filter(c=>c.completed===true).length} défis terminés</span></div>{challenges.slice(0,10).map(c=><article className={labStyles.item} key={text(c,'id')}><h3>{text(c,'prompt')}</h3><p>{text(c,'response')}</p></article>)}</section>}
    {tab==='analytics'&&<section className={labStyles.panel}><h2><BrainCircuit/> [ DEEP WORK ANALYTICS ]</h2><div className={labStyles.summary}><div><small>FOCUS MINUTES</small><strong>{analytics.total}</strong></div><div><small>SESSIONS</small><strong>{sessions.length}</strong></div><div><small>ACTIVE DAYS</small><strong>{analytics.days}</strong></div><div><small>IDEAS</small><strong>{ideas.length}</strong></div><div><small>CREATIVE QUESTS</small><strong>{challenges.filter(c=>c.completed===true).length}</strong></div></div><h3>LAST 7 DAYS · FOCUS MINUTES</h3><div className={labStyles.chart}>{analytics.past.map(day=><div key={day.day} className={labStyles.barCol}><strong>{day.minutes}</strong><div className={labStyles.barSpace}><div style={{height:`${100*day.minutes/analytics.max}%`}}/></div><small>{day.day.slice(5)}</small></div>)}</div><h3>RECENT SESSIONS</h3>{sessions.slice(-20).reverse().map(s=><div className={labStyles.nodeRow} key={text(s,'id')}><span>{new Date(text(s,'date')).toLocaleString()}</span><strong>{text(s,'label')}</strong><span>{text(s,'minutes')} min</span>{s.rewardStatus==='pending'&&<button onClick={()=>void send('focus.claim',{id:text(s,'id'),expectedRevision:revision('sessions',s)})}>RETRY REWARD</button>}</div>)}{!sessions.length&&<p className={labStyles.hint}>Termine ta première session Pomodoro pour afficher les statistiques.</p>}</section>}
  </section>;
}

function MindCanvas({nodes,selected,onChoose,title}:{nodes:HunterRow[];selected:string;onChoose:(id:string)=>void;title:(row:HunterRow|null|undefined,key:string,fallback?:string)=>string}){
  const width=900,height=Math.max(300,Math.ceil(nodes.length/5)*130+80);
  const located=nodes.map((row,index)=>({row,id:title(row,'id'),parentId:title(row,'parentId'),label:title(row,'title'),x:100+(index%5)*173,y:70+Math.floor(index/5)*130}));
  const byId=new Map(located.map(item=>[item.id,item]));
  return <div className={labStyles.mindScroll}>
    {located.length===0?<p className={labStyles.hint}>Ajoute une idée racine pour commencer ta carte.</p>:<svg viewBox={`0 0 ${width} ${height}`} style={{minWidth:Math.min(width,Math.max(520,nodes.length*110)),height:'auto',width:'100%'}} role="img" aria-label="Mind map of ideas and their parent branches">
      {located.map(item=>{const ancestor=byId.get(item.parentId);return ancestor?<line key={'edge-'+item.id} x1={ancestor.x} y1={ancestor.y} x2={item.x} y2={item.y} stroke="#4ccfff" strokeWidth="2" opacity=".65"/>:null})}
      {located.map(item=><g key={item.id}>
        <rect x={item.x-73} y={item.y-27} width="146" height="54" rx="9" fill={selected===item.id?'#184c72':'#08253e'} stroke={selected===item.id?'#e0faff':'#46b9ef'} strokeWidth="2"/>
        <text x={item.x} y={item.y-3} fill="#dcf7ff" textAnchor="middle" fontSize="11">{item.label.length>21?item.label.slice(0,20)+'…':item.label}</text>
        <text x={item.x} y={item.y+15} fill="#81b8d6" fontSize="9" textAnchor="middle">{item.parentId?'BRANCH':'ROOT'}</text>
      </g>)}
    </svg>}
    <div className={labStyles.nodePicker} aria-label="Choose a parent idea">{located.map(item=><button type="button" key={item.id} onClick={()=>onChoose(item.id)} className={selected===item.id?labStyles.selected:labStyles.secondary} aria-pressed={selected===item.id}>{item.label}</button>)}</div>
  </div>;
}
