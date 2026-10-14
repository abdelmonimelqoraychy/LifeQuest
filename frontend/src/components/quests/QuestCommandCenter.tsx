"use client";
import { useEffect, useState } from "react";
import { BookOpen, CheckCircle2, Plus, Pencil, Archive, Target, Trash2, CalendarDays } from "lucide-react";
import {QUEST_REWARDS} from "@/lib/hunterCore";
import type { Attribute } from "@/types";
import type { Frequency, QuestSystemState, SystemQuest, StoryArc } from "@/lib/questSystem";
import { hasCompleted, isDue, localDate } from "@/lib/questSystem";
import styles from "./QuestCommandCenter.module.css";

const frequencies: { id: Frequency; label: string }[] = [
  { id: "daily", label: "DAILY QUESTS" }, { id: "weekly", label: "WEEKLY QUESTS" },
  { id: "monthly", label: "MONTHLY QUESTS" }, { id: "once", label: "SPECIAL QUESTS" },
];
export type QuestDraft = { title: string; description: string; frequency: Frequency; attribute: Attribute; difficulty: "EASY"|"NORMAL"|"HARD"; xp: number; arcId: string; targetDate: string };
const blank: QuestDraft = { title: "", description: "", frequency: "daily", attribute: "discipline", difficulty: "NORMAL", xp: 50, arcId: "", targetDate: "" };
const rewards = QUEST_REWARDS;
export default function QuestCommandCenter({ data, onCreate, onUpdate, onArchive, onRestore, onComplete, onCreateArc, onDeleteArc, serverAuthoritative = false }: {
  data: QuestSystemState;
  onCreate: (draft: QuestDraft) => void;
  onUpdate: (id: string, draft: QuestDraft) => void;
  onArchive: (id: string) => void;
  onRestore?: (id: string) => void;
  onComplete: (id: string) => void;
  onCreateArc: (title: string, description: string, date: string) => void;
  onDeleteArc: (id: string) => void;
  /** Let PostgreSQL decide due/completed status; client calendar is display-only. */
  serverAuthoritative?: boolean;
}) {
  const [tab, setTab] = useState<Frequency>("daily");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<QuestDraft>(blank);
  const [showEditor, setShowEditor] = useState(false);
  const [showArc, setShowArc] = useState(false);
  const [arcTitle, setArcTitle] = useState("");
  const [arcDescription, setArcDescription] = useState("");
  const [arcDate, setArcDate] = useState("");
  // Next.js 16 prerenders Client Components. Read the current clock only after mount.
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => {
    const refresh = () => setToday(new Date());
    refresh();
    window.addEventListener("focus", refresh);
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  const visible = data.quests.filter(q => showArchived ? q.archived : q.frequency === tab && !q.archived);
  const done = !serverAuthoritative && today ? visible.filter(q => hasCompleted(q, data.completions, today)).length : 0;
  const openCreate = () => { setDraft({ ...blank, frequency: tab }); setEditing(null); setShowEditor(true); };
  const openEdit = (q: SystemQuest) => { setDraft({ title: q.title, description: q.description, frequency: q.frequency, attribute: q.attribute, difficulty: q.difficulty, xp: q.xp, arcId: q.arcId || "", targetDate: q.targetDate || "" }); setEditing(q.id); setShowEditor(true); };
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); if (!draft.title.trim()) return;
    if (editing) onUpdate(editing, draft); else onCreate(draft);
    setShowEditor(false);
  };
  return <section className={styles.panel} id="quest-log" aria-label="Quest Log">
    <div className={styles.header}><div><span className={styles.kicker}>[ SYSTEM // QUEST DIRECTORY ]</span><h2>ACTIVE QUESTS</h2><p>Gère et complète tes missions selon leur fréquence.</p></div><button type="button" className={styles.primary} onClick={openCreate}><Plus size={16}/> CREATE QUEST</button></div>
    <div className={styles.tabs} role="group" aria-label="Fréquence des missions">{frequencies.map(f=><button key={f.id} type="button" className={!showArchived&&tab===f.id?styles.selected:""} onClick={()=>{setShowArchived(false);setTab(f.id);}}>{f.label}</button>)}<button type="button" className={showArchived?styles.selected:""} onClick={()=>setShowArchived(true)}>ARCHIVES</button></div>
    <div className={styles.summary}><span>{showArchived ? `${visible.length} ARCHIVED` : serverAuthoritative ? "PERIOD VERIFIED BY SERVER" : `${done} / ${visible.length} CLEARED`}</span><span>{showArchived ? "ARCHIVE" : tab === "once" ? "ONE TIME" : tab.toUpperCase() + " RESET"}</span></div>
    {visible.length === 0 ? <div className={styles.empty}><Target size={34}/><strong>NO ACTIVE QUESTS</strong><p>Le System attend tes missions. Choisis CREATE QUEST pour commencer.</p></div> : <div className={styles.list}>{visible.map(q=>{
      const finished=!serverAuthoritative && today ? hasCompleted(q,data.completions,today) : false; const due=serverAuthoritative || (today ? isDue(q,today) : false);
      const arc=data.arcs.find(a=>a.id===q.arcId);
      return <article className={`${styles.item} ${finished?styles.finished:""}`} key={q.id}>
        <div className={styles.questBody}><strong>{q.title}</strong><p>{q.description || "Mission personnelle"}</p><small>{q.difficulty} · {q.attribute.toUpperCase()}{arc?` · ARC: ${arc.title}`:""}{q.targetDate?` · ${q.targetDate}`:""}</small></div>
        <div className={styles.actions}>{!showArchived&&<span className={styles.reward}>+{q.xp} EXP</span>}{showArchived?<button type="button" disabled={!onRestore} onClick={()=>onRestore?.(q.id)}>RESTORE</button>:<><button type="button" onClick={()=>onComplete(q.id)} disabled={finished||!due} className={styles.complete}>{finished?<><CheckCircle2 size={16}/> CLEARED</>:serverAuthoritative?"COMPLETE · SERVER CHECK":due?"COMPLETE":"NOT DUE"}</button><button type="button" aria-label={`Modifier ${q.title}`} title="Modifier" onClick={()=>openEdit(q)}><Pencil size={17}/></button><button type="button" aria-label={`Archiver ${q.title}`} title="Archiver" onClick={()=>{ if(window.confirm(`Archiver la quête « ${q.title} » ?`))onArchive(q.id); }}><Archive size={17}/></button></>}</div>
      </article>;
    })}</div>}
    <div className={styles.arcHead}><div><span className={styles.kicker}>[ LONG TERM OBJECTIVES ]</span><h3>STORY ARCS</h3></div><button type="button" className={styles.secondary} onClick={()=>setShowArc(v=>!v)}><Plus size={15}/> CREATE ARC</button></div>
    {showArc&&<form className={styles.form} onSubmit={e=>{e.preventDefault();if(!arcTitle.trim()||!arcDate)return;onCreateArc(arcTitle,arcDescription,arcDate);setArcTitle("");setArcDescription("");setArcDate("");setShowArc(false);}}><label>ARC TITLE<input required maxLength={90} value={arcTitle} onChange={e=>setArcTitle(e.target.value)}/></label><label>DESCRIPTION<input maxLength={220} value={arcDescription} onChange={e=>setArcDescription(e.target.value)}/></label><label>TARGET DATE (MAX 2 YEARS)<input required type="date" min={today ? localDate(today) : undefined} max={today ? localDate(new Date(today.getFullYear()+2,today.getMonth(),today.getDate())) : undefined} value={arcDate} onChange={e=>setArcDate(e.target.value)}/></label><button type="submit" className={styles.primary}>CREATE ARC</button></form>}
    <div className={styles.arcs}>{data.arcs.length===0?<p className={styles.muted}>Aucun Story Arc. Définis une vision à long terme, puis rattache tes quêtes.</p>:data.arcs.map((arc:StoryArc)=><div className={styles.arc} key={arc.id}><BookOpen size={20}/><div><strong>{arc.title}</strong><p>{arc.description || "Main Quest"}</p><small><CalendarDays size={13}/> TARGET {arc.targetDate} · {data.quests.filter(q=>!q.archived&&q.arcId===arc.id).length} QUESTS</small></div><button type="button" title="Supprimer cet arc (sans supprimer les quêtes)" aria-label={`Supprimer l'arc ${arc.title}`} onClick={()=>{if(window.confirm(`Supprimer l'arc « ${arc.title} » ? Les quêtes seront conservées.`))onDeleteArc(arc.id);}}><Trash2 size={16}/></button></div>)}</div>
    {showEditor&&<div className={styles.backdrop} role="presentation"><div className={styles.dialog} role="dialog" aria-modal="true" aria-label={editing?"EDIT QUEST":"CREATE QUEST"}><h3>{editing?"EDIT QUEST":"CREATE QUEST"}</h3><form className={styles.form} onSubmit={submit}>
      <label>QUEST NAME<input autoFocus required maxLength={100} value={draft.title} onChange={e=>setDraft(v=>({...v,title:e.target.value}))}/></label>
      <label>DESCRIPTION<input maxLength={250} value={draft.description} onChange={e=>setDraft(v=>({...v,description:e.target.value}))}/></label>
      <div className={styles.two}><label>FREQUENCY<select value={draft.frequency} onChange={e=>setDraft(v=>({...v,frequency:e.target.value as Frequency}))}>{frequencies.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></label><label>ATTRIBUTE<select value={draft.attribute} onChange={e=>setDraft(v=>({...v,attribute:e.target.value as Attribute}))}>{["focus","discipline","knowledge","energy","consistency"].map(a=><option value={a} key={a}>{a.toUpperCase()}</option>)}</select></label></div>
      <div className={styles.two}><label>DIFFICULTY<select value={draft.difficulty} onChange={e=>{const difficulty=e.target.value as QuestDraft["difficulty"];setDraft(v=>({...v,difficulty,xp:rewards[difficulty]}));}}><option value="EASY">EASY</option><option value="NORMAL">NORMAL</option><option value="HARD">HARD</option></select></label><label>EXP REWARD<input type="number" readOnly value={draft.xp}/></label></div>
      <label>STORY ARC<select value={draft.arcId} onChange={e=>setDraft(v=>({...v,arcId:e.target.value}))}><option value="">NO ARC</option>{data.arcs.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}</select></label>
      {draft.frequency==="once"&&<label>AVAILABLE FROM<input type="date" value={draft.targetDate} onChange={e=>setDraft(v=>({...v,targetDate:e.target.value}))}/></label>}
      <div className={styles.dialogActions}><button type="button" className={styles.secondary} onClick={()=>setShowEditor(false)}>CANCEL</button><button type="submit" className={styles.primary}>{editing?"SAVE CHANGES":"CREATE QUEST"}</button></div>
    </form></div></div>}
  </section>;
}
