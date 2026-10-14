"use client";
import {useMemo, useRef, useState} from "react";
import Link from "next/link";
import { CheckCircle2, Pencil, Archive } from "lucide-react";
import type { QuestSystemState, SystemQuest } from "@/lib/questSystem";
import {completionIndex, hasCompleted, isDue } from "@/lib/questSystem";
import type { QuestReward } from "@/lib/useQuestSystem";
import styles from "./QuestUI.module.css";
export default function QuestRows({ quests, data, date, onComplete, onArchive, onRestore, archived=false, showManage=false }:{
  quests:SystemQuest[];data:QuestSystemState;date:Date;
  onComplete:(id:string)=>Promise<QuestReward|null>;onArchive?:(id:string)=>Promise<boolean>;onRestore?:(id:string)=>Promise<boolean>;archived?:boolean;showManage?:boolean;
}){
  const completed=useMemo(()=>completionIndex(data.completions),[data.completions]);
  const [restoring,setRestoring]=useState<string|null>(null);
  const pending=useRef(false);
  const restore=async(id:string)=>{if(pending.current||!onRestore)return;pending.current=true;setRestoring(id);try{await onRestore(id);}finally{pending.current=false;setRestoring(null);}};
  if (archived&&!quests.length) return <div className={styles.empty}><strong>Aucune quête archivée</strong><p>Les quêtes archivées restent conservées ici.</p></div>;
  if (!quests.length) return <div className={styles.empty}><strong>NO ACTIVE QUESTS</strong><p>Le System attend tes missions.</p><Link className={styles.link} href="/quests/create">CREATE QUEST</Link></div>;
  return <div className={styles.rows}>{quests.map(q=>{
    const finished=hasCompleted(q,completed,date);
    const due=isDue(q,date);
    const arc=data.arcs.find(a=>a.id===q.arcId);
    return <article className={styles.entry} key={q.id}>
      <div className={styles.entryText}><strong>{q.title}</strong><p>{q.description||"PERSONAL QUEST"}</p><small>{q.frequency.toUpperCase()} · {q.difficulty} · {q.attribute.toUpperCase()}{arc?` · ARC: ${arc.title}`:""}{q.availableAfter?` · DISPONIBLE LE ${q.availableAfter}`:""}</small></div>
      <div className={styles.entryActions}><strong className={styles.reward}>{archived?'':'+'}{q.xp} EXP</strong>{archived?<button type="button" disabled={restoring!==null} aria-label={`Restaurer ${q.title}`} onClick={()=>void restore(q.id)}>{restoring===q.id?'Restauration…':'Restaurer'}</button>:<button type="button" disabled={finished||!due} onClick={()=>onComplete(q.id)}>{finished?<><CheckCircle2 size={14}/> CLEARED</>:due?"COMPLETE":"NOT DUE"}</button>}
      {showManage&&!archived&&<><Link href={`/quests/create?edit=${encodeURIComponent(q.id)}`} className={styles.link} aria-label={`Modifier ${q.title}`} title="EDIT QUEST"><Pencil size={16}/></Link><button type="button" title="ARCHIVE QUEST" aria-label={`Archiver ${q.title}`} onClick={()=>{if(onArchive&&window.confirm(`Archiver « ${q.title} » ?`))onArchive(q.id);}}><Archive size={16}/></button></>}
      </div>
    </article>;
  })}</div>;
}
