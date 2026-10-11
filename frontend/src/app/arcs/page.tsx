"use client";
import { useState } from "react";
import Link from "next/link";
import { BookOpen, Trash2 } from "lucide-react";
import SystemShell from "@/components/system/SystemShell";
import { useQuestSystem } from "@/lib/useQuestSystem";
import ui from "@/components/system/QuestUI.module.css";
export default function StoryArcsPage(){
  const system=useQuestSystem();
  const [title,setTitle]=useState("");const [description,setDescription]=useState("");const [date,setDate]=useState("");const [message,setMessage]=useState("");
  const max=system.today?(()=>{const parts=system.today.split("-").map(Number);const d=new Date(parts[0]+2,parts[1]-1,parts[2]);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;})():undefined;
  const onSubmit=(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const ok=system.addArc(title,description,date);if(ok){setTitle("");setDescription("");setDate("");setMessage("STORY ARC REGISTERED");}else setMessage("Check title and target date (maximum 2 years).");};
  return <SystemShell title="STORY ARCS" subtitle="YOUR LONG-TERM PATH IS WRITTEN HERE">
    {system.error&&<div role="alert" className={ui.danger}>{system.error}</div>}
    {!system.ready?<p className={ui.notice}>SYSTEM LOADING...</p>:<>
      <section className={ui.panel}><div className={ui.header}><div><span className={ui.kicker}>[ MAIN QUEST // STORY ARC ]</span><h2>CREATE STORY ARC</h2><p>Construis un objectif allant jusqu&apos;à deux ans.</p></div></div>
        <form className={ui.form} onSubmit={onSubmit}>
          <label>ARC TITLE<input maxLength={90} required value={title} onChange={e=>setTitle(e.target.value)}/></label>
          <label>DESCRIPTION<input maxLength={220} value={description} onChange={e=>setDescription(e.target.value)}/></label>
          <label>TARGET DATE<input type="date" required min={system.today||undefined} max={max} value={date} onChange={e=>setDate(e.target.value)}/></label>
          <button type="submit" className={ui.primary}>CREATE ARC</button>
        </form>
        {message&&<div role="status" className={ui.notice}>{message}</div>}
      </section>
      <section className={ui.panel}><div className={ui.header}><div><span className={ui.kicker}>[ ACTIVE STORY ARCS ]</span><h2>MAIN QUESTS</h2></div><Link href="/quests/create" className={ui.link}>+ CREATE QUEST</Link></div>
        {system.data.arcs.length===0?<p className={ui.empty}>NO STORY ARCS YET</p>:<div className={ui.arcs}>{system.data.arcs.map(a=><article className={ui.arc} key={a.id}><BookOpen size={20}/><div><strong>{a.title}</strong><p>{a.description||"MAIN QUEST"}</p><small>TARGET: {a.targetDate} · {system.data.quests.filter(q=>!q.archived&&q.arcId===a.id).length} QUESTS</small></div><button type="button" title="DELETE ARC" aria-label={`Delete ${a.title}`} onClick={()=>{if(window.confirm(`Delete ARC « ${a.title} »? Linked quests remain.`))system.deleteArc(a.id);}}><Trash2 size={16}/></button></article>)}</div>}
      </section>
    </>}
  </SystemShell>;
}
