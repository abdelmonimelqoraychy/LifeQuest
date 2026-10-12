"use client";
import Modal from '@/components/ui/Modal';
import { useMemo, useState } from "react";
import Link from "next/link";
import SystemShell from "@/components/system/SystemShell";
import QuestRows from "@/components/system/QuestRows";
import { completionIndex, hasCompleted, type Frequency } from "@/lib/questSystem";
import { useQuestSystem, type QuestReward } from "@/lib/useQuestSystem";
import ui from "@/components/system/QuestUI.module.css";
const tabs:{id:Frequency;name:string}[]=[{id:"daily",name:"DAILY QUESTS"},{id:"weekly",name:"WEEKLY QUESTS"},{id:"monthly",name:"MONTHLY QUESTS"},{id:"once",name:"SPECIAL QUESTS"}];
export default function QuestLogPage(){
  const system=useQuestSystem();
  const [tab,setTab]=useState<Frequency|'archived'>("daily");
  const [restoreNotice,setRestoreNotice]=useState('');
  const [notice,setNotice]=useState<QuestReward|null>(null);
  const completed=useMemo(()=>completionIndex(system.data.completions),[system.data.completions]);
  const archived=tab==='archived';
  const quests=system.data.quests.filter(q=>archived?!!q.archived:!q.archived&&q.frequency===tab);
  const done=quests.filter(q=>hasCompleted(q,completed,system.currentDate)).length;
  const handleComplete=async(id:string)=>{const result=await system.completeQuest(id);if(result)setNotice(result);return result;};
  const handleRestore=async(id:string)=>{setRestoreNotice('');const title=system.data.quests.find(q=>q.id===id)?.title;const restored=await system.restoreQuest(id);if(restored)setRestoreNotice(`« ${title} » restaurée dans sa liste active. Aucun XP attribué.`);return restored;};
  return <SystemShell title="QUEST LOG" subtitle="THE SYSTEM RECORDS EVERY MISSION">
    {system.error&&<div role="alert" className={ui.danger}>{system.error}</div>}
    {!system.ready?<p className={ui.notice}>SYSTEM LOADING...</p>:<section className={ui.panel}>
      <div className={ui.header}><div><span className={ui.kicker}>[ SYSTEM // QUEST DIRECTORY ]</span><h2>{archived?'Quêtes archivées':'ACTIVE QUESTS'}</h2><p>{archived?'Restaurer conserve la quête et ses validations, sans attribuer de nouveaux XP.':'Gère et complète tes missions selon leur fréquence.'}</p></div><Link className={ui.link} href="/quests/create">+ CREATE QUEST</Link></div>
      <div className={ui.tabs} role="group" aria-label="Vue des quêtes">{tabs.map(x=><button key={x.id} type="button" aria-pressed={tab===x.id} className={tab===x.id?ui.selected:""} onClick={()=>setTab(x.id)}>{x.name}</button>)}<button type="button" aria-pressed={archived} className={archived?ui.selected:''} onClick={()=>setTab('archived')}>Quêtes archivées</button></div>
      {restoreNotice&&<p role="status" className={ui.notice}>{restoreNotice}</p>}
      <div className={ui.summary}><span>{archived?`${quests.length} ARCHIVÉES`:`${done} / ${quests.length} CLEARED`}</span><span>{archived?'ARCHIVES':`${tab.toUpperCase()} QUESTS`}</span></div>
      <QuestRows quests={quests} data={system.data} date={system.currentDate} onComplete={handleComplete} onArchive={system.archiveQuest} onRestore={handleRestore} archived={archived} showManage/>
    </section>}
    {notice&&<Modal label="Récompense de quête" onClose={()=>setNotice(null)}><div className="reward-modal"><div className="eyebrow">[ SYSTEM NOTIFICATION ]</div><h2>{notice.levelAfter>notice.levelBefore?"LEVEL UP!":"QUEST COMPLETE"}</h2><p>{notice.title}</p><div className="reward-xp">+{notice.xp} EXP</div><button className="continue-btn" onClick={()=>setNotice(null)}>CONTINUE</button></div></Modal>}
  </SystemShell>;
}
