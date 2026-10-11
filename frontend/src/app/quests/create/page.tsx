"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Attribute } from "@/types";
import type { Frequency } from "@/lib/questSystem";
import { useQuestSystem, type QuestInput } from "@/lib/useQuestSystem";
import SystemShell from "@/components/system/SystemShell";
import ui from "@/components/system/QuestUI.module.css";
const initial:QuestInput={title:"",description:"",frequency:"daily",attribute:"discipline",difficulty:"NORMAL",xp:50,arcId:"",targetDate:""};
const reward={EASY:30,NORMAL:50,HARD:80};
const freqs:{value:Frequency;label:string}[]=[{value:"daily",label:"DAILY QUEST"},{value:"weekly",label:"WEEKLY QUEST"},{value:"monthly",label:"MONTHLY QUEST"},{value:"once",label:"SPECIAL QUEST"}];
function QuestEditor(){
  const system=useQuestSystem(); const router=useRouter(); const search=useSearchParams();
  const editId=search.get("edit");
  const [draft,setDraft]=useState<QuestInput>(initial);
  const [formError,setFormError]=useState("");
  useEffect(()=>{
    if(!system.ready)return;
    const quest=editId?system.data.quests.find(q=>q.id===editId&&!q.archived):undefined;
    if(quest)setDraft({title:quest.title,description:quest.description,frequency:quest.frequency,attribute:quest.attribute,difficulty:quest.difficulty,xp:quest.xp,arcId:quest.arcId||"",targetDate:quest.targetDate||""});
  // Only initialize when data loads or editing target changes; do not reset form while typing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[system.ready,editId]);
  const missing=Boolean(editId&&!system.data.quests.some(q=>q.id===editId&&!q.archived));
  function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(!draft.title.trim()){setFormError("Quest title is required");return;}
    if(missing){setFormError("Quest unavailable");return;}
    const ok=editId?system.updateQuest(editId,draft):system.createQuest(draft);
    if(ok)router.push("/quests");else setFormError("Unable to save quest");
  }
  return <SystemShell title={editId?"EDIT QUEST":"CREATE QUEST"} subtitle="THE SYSTEM ACCEPTS A NEW MISSION">
    {system.error&&<div role="alert" className={ui.danger}>{system.error}</div>}
    {!system.ready?<p className={ui.notice}>SYSTEM LOADING...</p>:missing?<div className={ui.formCard}><h2>QUEST NOT FOUND</h2><Link className={ui.link} href="/quests">RETURN TO QUEST LOG</Link></div>:<div className={ui.formCard}>
      <h2>{editId?"MODIFY QUEST":"REGISTER NEW QUEST"}</h2><p>Les récompenses sont liées à la difficulté. Chaque période ne peut être validée qu&apos;une fois.</p>
      <form className={ui.form} onSubmit={submit}>
        <label>QUEST NAME<input required maxLength={100} value={draft.title} onChange={e=>setDraft(p=>({...p,title:e.target.value}))} placeholder="Ex: Étudier Python 45 minutes"/></label>
        <label>DESCRIPTION<input maxLength={250} value={draft.description} onChange={e=>setDraft(p=>({...p,description:e.target.value}))}/></label>
        <div className={ui.two}>
          <label>FREQUENCY<select value={draft.frequency} onChange={e=>setDraft(p=>({...p,frequency:e.target.value as Frequency}))}>{freqs.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}</select></label>
          <label>ATTRIBUTE<select value={draft.attribute} onChange={e=>setDraft(p=>({...p,attribute:e.target.value as Attribute}))}>{["focus","discipline","knowledge","energy","consistency"].map(a=><option key={a} value={a}>{a.toUpperCase()}</option>)}</select></label>
        </div>
        <div className={ui.two}>
          <label>DIFFICULTY<select value={draft.difficulty} onChange={e=>{const difficulty=e.target.value as QuestInput["difficulty"];setDraft(p=>({...p,difficulty,xp:reward[difficulty]}));}}><option value="EASY">EASY</option><option value="NORMAL">NORMAL</option><option value="HARD">HARD</option></select></label>
          <label>EXP REWARD<input type="number" readOnly value={draft.xp}/></label>
        </div>
        <label>STORY ARC<select value={draft.arcId} onChange={e=>setDraft(p=>({...p,arcId:e.target.value}))}><option value="">NO ARC</option>{system.data.arcs.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}</select></label>
        {draft.frequency==="once"&&<label>AVAILABLE FROM<input type="date" value={draft.targetDate} onChange={e=>setDraft(p=>({...p,targetDate:e.target.value}))}/></label>}
        {formError&&<p role="alert" className={ui.danger}>{formError}</p>}
        <div className={ui.dialogActions}><Link className={ui.link} href="/quests">CANCEL</Link><button className={ui.primary} type="submit">{editId?"SAVE QUEST":"CREATE QUEST"}</button></div>
      </form><div className={ui.tip}>Pour créer un objectif à long terme, ouvre STORY ARCS puis associe tes quêtes à cet ARC.</div>
    </div>}
  </SystemShell>;
}
export default function CreateQuestPage(){return <Suspense fallback={<div>LOADING SYSTEM...</div>}><QuestEditor/></Suspense>;}
