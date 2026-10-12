"use client";
import { useMemo, useState } from "react";
import { achievementProgress } from '@/lib/achievements';
import Link from "next/link";
import SystemShell from "@/components/system/SystemShell";
import { useQuestSystem } from "@/lib/useQuestSystem";
import {completionIndex, hasCompleted } from "@/lib/questSystem";
import {useStoredData} from '@/lib/useStoredData';
import BossBattlePanel from '@/components/hunter/BossBattlePanel';
import { extraDefault, loadExtra, rankForLevel, EXTRA_KEY, } from "@/lib/hunterMissions";
import ui from "./HunterOperations.module.css";
import { safeHunterProgress, completionDays, streakDays } from "@/lib/hunterCore";
const EMPTY_EXTRA=extraDefault();
export default function HunterOperationsPage() {
  const system = useQuestSystem();
  const {data:extra,ready:loaded,error:loadError}=useStoredData(EXTRA_KEY,loadExtra,EMPTY_EXTRA);
  const [arcFilter, setArcFilter] = useState("all");
  const level = safeHunterProgress(system.data.totalXP).level;
  const log = useMemo(() => [...system.data.completions].sort((a,b) => b.completedAt.localeCompare(a.completedAt)), [system.data.completions]);
  const questLog = useMemo(()=>log.filter(c=>!c.questId.startsWith("lifequest:activity:")),[log]);
  const streak=system.today?streakDays(completionDays(questLog),system.today):0;
  const allAchievements=useMemo(()=>achievementProgress(system.data,level),[system.data,level]);
  const questById=useMemo(()=>new Map(system.data.quests.map(q=>[q.id,q])),[system.data.quests]);
  const completed=useMemo(()=>completionIndex(system.data.completions),[system.data.completions]);
  const arcInfo = system.data.arcs.map(arc => {
    const quests = system.data.quests.filter(q => !q.archived && q.arcId === arc.id);
    const done = quests.filter(q => hasCompleted(q,completed,system.currentDate)).length;
    return { ...arc, quests, done };
  });
  const visibleHistory = log.filter(c => arcFilter === "all" || (c.arcId!==undefined?c.arcId:questById.get(c.questId)?.arcId) === arcFilter);
  return <SystemShell title="HUNTER OPERATIONS" subtitle="MISSIONS · ACHIEVEMENTS · HISTORY">
    <section className={ui.root}>
      <div className={ui.banner}><div><span className={ui.kicker}>[ SYSTEM // OPERATIONS ]</span><h1>HUNTER COMMAND CENTER</h1><p>LEVEL {level} · RANK {rankForLevel(level)} · {questLog.length} QUESTS CLEARED</p></div><div><Link href="/hunter-core">HUNTER CORE →</Link> · <Link href="/dashboard">RETURN TO STATUS WINDOW →</Link></div></div>
      {(system.error || loadError) && <p role="alert" className={ui.error}>{system.error || loadError}</p>}
      {!loaded || !system.ready ? <p>SYSTEM LOADING...</p> : <>
      <div className={ui.grid}>
        <BossBattlePanel bosses={extra.bosses} disabled={!!loadError||!!system.error}/>
        <section className={ui.panel}><span className={ui.kicker}>[ SYSTEM ACHIEVEMENTS ]</span><h2>HUNTER TITLES</h2><p>Titres débloqués une seule fois, conservés après les jours de repos. Aucune récompense EXP supplémentaire.</p><div className={ui.achievements}>{allAchievements.map(a=><div className={`${ui.achievement} ${a.done?ui.unlocked:""}`} key={a.id}><strong>{a.done?"◆ ":"◇ "}{a.title}</strong><small>{a.criterion}</small><small>{a.done?"UNLOCKED":`${Math.min(a.progress,a.target)} / ${a.target}`}</small>{a.unlockedAt&&<small>Débloqué le {new Date(a.unlockedAt).toLocaleDateString("fr-FR")}</small>}</div>)}</div></section>
        <section className={ui.panel}><span className={ui.kicker}>[ MAIN QUESTS ]</span><h2>STORY ARCS PROGRESS</h2><p>Progression des quêtes liées à chaque arc ; les quêtes récurrentes comptent pour leur période actuelle.</p><Link href="/arcs">MANAGE STORY ARCS →</Link>{arcInfo.length===0 && <p className={ui.muted}>NO STORY ARCS</p>}{arcInfo.map(a=><article className={ui.item} key={a.id}><strong>{a.title}</strong><small>TARGET {a.targetDate} · {a.done} / {a.quests.length} QUESTS</small><div className={ui.track}><div style={{width:`${a.quests.length?Math.round(a.done/a.quests.length*100):0}%`}}/></div><span className={ui.muted}>{a.description}</span></article>)}</section>
        <section className={ui.panel}><span className={ui.kicker}>[ HUNTER ARCHIVE ]</span><h2>ACTIVITY HISTORY</h2><p>{questLog.length} QUEST COMPLETIONS · {system.data.totalXP.toLocaleString()} TOTAL EXP · CURRENT STREAK {streak} DAYS</p><label className={ui.filter}>STORY ARC <select value={arcFilter} onChange={e=>setArcFilter(e.target.value)}><option value="all">ALL QUESTS</option>{system.data.arcs.map(a=><option value={a.id} key={a.id}>{a.title}</option>)}</select></label><div className={ui.history}>{visibleHistory.slice(0,100).map(c=><article key={c.id} className={ui.historyItem}><div><strong>{c.questTitle||questById.get(c.questId)?.title||(c.questId.startsWith("lifequest:activity:focus:")?"FOCUS SESSION":c.questId.startsWith("lifequest:activity:boss:")?"BOSS MISSION":"Archived quest")}</strong><small>{new Date(c.completedAt).toLocaleString("fr-FR")}</small></div><span>+{c.xpAwarded} EXP</span></article>)}{visibleHistory.length===0&&<p className={ui.muted}>NO COMPLETIONS YET</p>}</div><h3>SYSTEM EVENTS</h3>{extra.events.slice(-15).reverse().map(ev=><div key={ev.id} className={ui.event}>{ev.title} <small>{new Date(ev.at).toLocaleString("fr-FR")}</small></div>)}</section>
      </div></>}
    </section>
  </SystemShell>;
}
