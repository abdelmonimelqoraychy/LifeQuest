"use client";
import Link from "next/link";
import { CheckCircle2, Pencil, Archive } from "lucide-react";
import type { QuestSystemState, SystemQuest } from "@/lib/questSystem";
import { hasCompleted, isDue } from "@/lib/questSystem";
import type { QuestReward } from "@/lib/useQuestSystem";
import styles from "./QuestUI.module.css";
export default function QuestRows({ quests, data, date, onComplete, onArchive, showManage=false }:{
  quests:SystemQuest[];data:QuestSystemState;date:Date;
  onComplete:(id:string)=>QuestReward|null;onArchive?:(id:string)=>boolean;showManage?:boolean;
}){
  if (!quests.length) return <div className={styles.empty}><strong>NO ACTIVE QUESTS</strong><p>Le System attend tes missions.</p><Link className={styles.link} href="/quests/create">CREATE QUEST</Link></div>;
  return <div className={styles.rows}>{quests.map(q=>{
    const finished=hasCompleted(q,data.completions,date);
    const due=isDue(q,date);
    const arc=data.arcs.find(a=>a.id===q.arcId);
    return <article className={styles.entry} key={q.id}>
      <div className={styles.entryText}><strong>{q.title}</strong><p>{q.description||"PERSONAL QUEST"}</p><small>{q.frequency.toUpperCase()} · {q.difficulty} · {q.attribute.toUpperCase()}{arc?` · ARC: ${arc.title}`:""}</small></div>
      <div className={styles.entryActions}><strong className={styles.reward}>+{q.xp} EXP</strong><button type="button" disabled={finished||!due} onClick={()=>onComplete(q.id)}>{finished?<><CheckCircle2 size={14}/> CLEARED</>:due?"COMPLETE":"NOT DUE"}</button>
      {showManage&&<><Link href={`/quests/create?edit=${encodeURIComponent(q.id)}`} className={styles.link} title="EDIT QUEST"><Pencil size={16}/></Link><button type="button" title="ARCHIVE QUEST" aria-label={`Archiver ${q.title}`} onClick={()=>{if(onArchive&&window.confirm(`Archiver « ${q.title} » ?`))onArchive(q.id);}}><Archive size={16}/></button></>}
      </div>
    </article>;
  })}</div>;
}
