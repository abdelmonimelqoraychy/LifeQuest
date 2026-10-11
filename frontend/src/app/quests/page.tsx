"use client";
import { useState } from "react";
import Link from "next/link";
import SystemShell from "@/components/system/SystemShell";
import QuestRows from "@/components/system/QuestRows";
import { hasCompleted, type Frequency } from "@/lib/questSystem";
import { useQuestSystem, type QuestReward } from "@/lib/useQuestSystem";
import ui from "@/components/system/QuestUI.module.css";
const tabs:{id:Frequency;name:string}[]=[{id:"daily",name:"DAILY QUESTS"},{id:"weekly",name:"WEEKLY QUESTS"},{id:"monthly",name:"MONTHLY QUESTS"},{id:"once",name:"SPECIAL QUESTS"}];
export default function QuestLogPage(){
  const system=useQuestSystem();
  const [tab,setTab]=useState<Frequency>("daily");
  const [notice,setNotice]=useState<QuestReward|null>(null);
  const quests=system.data.quests.filter(q=>!q.archived&&q.frequency===tab);
  const done=quests.filter(q=>hasCompleted(q,system.data.completions,system.currentDate)).length;
  const handleComplete=(id:string)=>{const result=system.completeQuest(id);if(result)setNotice(result);return result;};
  return <SystemShell title="QUEST LOG" subtitle="THE SYSTEM RECORDS EVERY MISSION">
    {system.error&&<div role="alert" className={ui.danger}>{system.error}</div>}
    {!system.ready?<p className={ui.notice}>SYSTEM LOADING...</p>:<section className={ui.panel}>
      <div className={ui.header}><div><span className={ui.kicker}>[ SYSTEM // QUEST DIRECTORY ]</span><h2>ACTIVE QUESTS</h2><p>Gère et complète tes missions selon leur fréquence.</p></div><Link className={ui.link} href="/quests/create">+ CREATE QUEST</Link></div>
      <div className={ui.tabs} role="group" aria-label="Quest frequency">{tabs.map(x=><button key={x.id} type="button" className={tab===x.id?ui.selected:""} onClick={()=>setTab(x.id)}>{x.name}</button>)}</div>
      <div className={ui.summary}><span>{done} / {quests.length} CLEARED</span><span>{tab.toUpperCase()} QUESTS</span></div>
      <QuestRows quests={quests} data={system.data} date={system.currentDate} onComplete={handleComplete} onArchive={system.archiveQuest} showManage/>
    </section>}
    {notice&&<div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Quest reward"><div className="reward-modal"><div className="eyebrow">[ SYSTEM NOTIFICATION ]</div><h2>{notice.levelAfter>notice.levelBefore?"LEVEL UP!":"QUEST COMPLETE"}</h2><p>{notice.title}</p><div className="reward-xp">+{notice.xp} EXP</div><button className="continue-btn" onClick={()=>setNotice(null)}>CONTINUE</button></div></div>}
  </SystemShell>;
}
