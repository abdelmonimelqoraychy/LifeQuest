"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import SystemShell from "@/components/system/SystemShell";
import { useQuestSystem } from "@/lib/useQuestSystem";
import { hasCompleted } from "@/lib/questSystem";
import { getLevel } from "@/data/mockPlayer";
import { extraDefault, hunterEvent, loadExtra, rankForLevel, saveExtra, type ExtraState } from "@/lib/hunterMissions";
import ui from "./HunterOperations.module.css";
import { awardActivityXP, safeHunterProgress } from "@/lib/hunterCore";
const id = () => crypto.randomUUID();
const badges = [
  { title: "FIRST CLEAR", target: 1, test: (n:number, _s:number) => n >= 1 },
  { title: "QUEST VETERAN", target: 100, test: (n:number, _s:number) => n >= 100 },
  { title: "DISCIPLINE MASTER", target: 30, test: (n:number, _s:number) => n >= 30 },
  { title: "RANK D HUNTER", target: 10, test: (_n:number, level:number) => level >= 10 },
  { title: "RANK S HUNTER", target: 50, test: (_n:number, level:number) => level >= 50 },
];
export default function HunterOperationsPage() {
  const system = useQuestSystem();
  const [extra, setExtra] = useState<ExtraState>(extraDefault);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [target, setTarget] = useState(10);
  const [arcFilter, setArcFilter] = useState("all");
  useEffect(() => { try { setExtra(loadExtra()); } catch (e) { setErr(e instanceof Error ? e.message : "Sauvegarde illisible"); } setLoaded(true); }, []);
  const commit = (fn: (state: ExtraState) => ExtraState) => {
    if (err || !loaded) return;
    try { const next = fn(loadExtra()); saveExtra(next); setExtra(next); } catch (e) { setErr(e instanceof Error ? e.message : "Enregistrement refusé"); }
  };
  const level = safeHunterProgress(system.data.totalXP).level;
  const log = useMemo(() => [...system.data.completions].sort((a,b) => b.completedAt.localeCompare(a.completedAt)), [system.data.completions]);
  const questLog = useMemo(()=>log.filter(c=>!c.questId.startsWith("lifequest:activity:")),[log]);
  const days = useMemo(() => new Set(questLog.map(c => c.completedAt.slice(0,10))), [questLog]);
  const today = system.today;
  let streak = 0;
  if (today) { const d = new Date(`${today}T12:00:00`); if (!days.has(today)) d.setDate(d.getDate()-1); while (days.has(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`)) { streak++; d.setDate(d.getDate()-1); } }
  const allAchievements = [...badges.map(b => ({title:b.title, done:b.test(questLog.length,level), progress:b.title.includes("RANK")?level:questLog.length, target:b.target})), { title:"7 DAY STREAK", done:streak>=7, progress:streak,target:7 }];
  const arcInfo = system.data.arcs.map(arc => {
    const quests = system.data.quests.filter(q => !q.archived && q.arcId === arc.id);
    const done = quests.filter(q => hasCompleted(q,system.data.completions,system.currentDate)).length;
    return { ...arc, quests, done };
  });
  const visibleHistory = log.filter(c => arcFilter === "all" || system.data.quests.find(q => q.id === c.questId)?.arcId === arcFilter);
  return <SystemShell title="HUNTER OPERATIONS" subtitle="MISSIONS · ACHIEVEMENTS · HISTORY">
    <main className={ui.root}>
      <div className={ui.banner}><div><span className={ui.kicker}>[ SYSTEM // OPERATIONS ]</span><h1>HUNTER COMMAND CENTER</h1><p>LEVEL {level} · RANK {rankForLevel(level)} · {questLog.length} QUESTS CLEARED</p></div><div><Link href="/hunter-core">HUNTER CORE →</Link> · <Link href="/dashboard">RETURN TO STATUS WINDOW →</Link></div></div>
      {(system.error || err) && <p role="alert" className={ui.error}>{system.error || err} — aucune sauvegarde modifiée.</p>}
      {!loaded || !system.ready ? <p>SYSTEM LOADING...</p> : <>
      <div className={ui.grid}>
        <section className={ui.panel}><span className={ui.kicker}>[ SPECIAL QUESTS ]</span><h2>BOSS MISSIONS</h2><p>Définis un défi mesurable. Chaque progression reste séparée des EXP classiques ; les récompenses EXP sont créditées une seule fois lorsque le Boss est terminé.</p>
          <form className={ui.form} onSubmit={e => {e.preventDefault();if(!title.trim() || !objective.trim())return;commit(s=>({...s,bosses:[...s.bosses,{id:id(),title:title.trim(),objective:objective.trim(),target:Math.max(1,target),current:0,xp:Math.min(300, Math.max(25,target*10)),createdAt:new Date().toISOString()}]}));setTitle("");setObjective("");}}>
          <input aria-label="Boss mission title" placeholder="BOSS TITLE" required maxLength={80} value={title} onChange={e=>setTitle(e.target.value)}/><input aria-label="Objective" placeholder="OBJECTIVE (e.g. 10 workouts)" required maxLength={120} value={objective} onChange={e=>setObjective(e.target.value)}/><label>OBJECTIVE TARGET <input aria-label="Target count" type="number" min="1" max="1000" value={target} onChange={e=>setTarget(Number(e.target.value)||1)}/></label><button disabled={!!err}>REGISTER BOSS</button></form>
          {extra.bosses.length === 0 && <p className={ui.muted}>NO BOSS MISSIONS REGISTERED</p>}
          {extra.bosses.map(b=><article className={ui.item} key={b.id}><strong>{b.completedAt?"✓ ":"⚔ "}{b.title}</strong><small>{b.objective} · {b.current}/{b.target} · Base reward: {b.xp} EXP (bonus / stabilité appliqués)</small><div className={ui.track}><div style={{width:`${Math.round(b.current/b.target*100)}%`}}/></div>{!b.completedAt && <button className={ui.small} disabled={!!err} onClick={()=>{const finishing=b.current+1>=b.target;commit(s=>({...s,bosses:s.bosses.map(x=>x.id===b.id?{...x,current:Math.min(x.target,x.current+1),completedAt:x.current+1>=x.target?new Date().toISOString():undefined}:x),events:finishing?[...s.events,hunterEvent("boss",`BOSS CLEARED: ${b.title}`)]:s.events}));if(finishing){try{awardActivityXP("boss",b.id,b.xp,"discipline")}catch(e){setErr(e instanceof Error?e.message:"XP boss non crédités")}}}}>+1 PROGRESS</button>}</article>)}
        </section>
        <section className={ui.panel}><span className={ui.kicker}>[ SYSTEM ACHIEVEMENTS ]</span><h2>HUNTER TITLES</h2><p>Succès calculés depuis tes vraies quêtes terminées et ton niveau.</p><div className={ui.achievements}>{allAchievements.map(a=><div className={`${ui.achievement} ${a.done?ui.unlocked:""}`} key={a.title}><strong>{a.done?"◆ ":"◇ "}{a.title}</strong><small>{a.done?"UNLOCKED":`${Math.min(a.progress,a.target)} / ${a.target}`}</small></div>)}</div></section>
        <section className={ui.panel}><span className={ui.kicker}>[ MAIN QUESTS ]</span><h2>STORY ARCS PROGRESS</h2><p>Progression des quêtes liées à chaque arc ; les quêtes récurrentes comptent pour leur période actuelle.</p><Link href="/arcs">MANAGE STORY ARCS →</Link>{arcInfo.length===0 && <p className={ui.muted}>NO STORY ARCS</p>}{arcInfo.map(a=><article className={ui.item} key={a.id}><strong>{a.title}</strong><small>TARGET {a.targetDate} · {a.done} / {a.quests.length} QUESTS</small><div className={ui.track}><div style={{width:`${a.quests.length?Math.round(a.done/a.quests.length*100):0}%`}}/></div><span className={ui.muted}>{a.description}</span></article>)}</section>
        <section className={ui.panel}><span className={ui.kicker}>[ HUNTER ARCHIVE ]</span><h2>ACTIVITY HISTORY</h2><p>{questLog.length} QUEST COMPLETIONS · {system.data.totalXP.toLocaleString()} TOTAL EXP · CURRENT STREAK {streak} DAYS</p><label className={ui.filter}>STORY ARC <select value={arcFilter} onChange={e=>setArcFilter(e.target.value)}><option value="all">ALL QUESTS</option>{system.data.arcs.map(a=><option value={a.id} key={a.id}>{a.title}</option>)}</select></label><div className={ui.history}>{visibleHistory.slice(0,100).map(c=><article key={c.id} className={ui.historyItem}><div><strong>{system.data.quests.find(q=>q.id===c.questId)?.title||(c.questId.startsWith("lifequest:activity:focus:")?"FOCUS SESSION":c.questId.startsWith("lifequest:activity:boss:")?"BOSS MISSION":"Archived quest")}</strong><small>{new Date(c.completedAt).toLocaleString("fr-FR")}</small></div><span>+{c.xpAwarded} EXP</span></article>)}{visibleHistory.length===0&&<p className={ui.muted}>NO COMPLETIONS YET</p>}</div><h3>SYSTEM EVENTS</h3>{extra.events.slice(-15).reverse().map(ev=><div key={ev.id} className={ui.event}>{ev.title} <small>{new Date(ev.at).toLocaleString("fr-FR")}</small></div>)}</section>
      </div></>}
    </main>
  </SystemShell>;
}
