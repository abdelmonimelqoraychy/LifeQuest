"use client";
import {useRef,useState,type ChangeEvent} from "react";
import Link from "next/link";
import SystemShell from "@/components/system/SystemShell";
import {useQuestSystem} from '@/lib/useQuestSystem';
import {useStoredData} from '@/lib/useStoredData';
import {withStorageLock} from '@/lib/storage';
import {EXTRA_KEY,loadExtra,extraDefault} from "@/lib/hunterMissions";
import {LAB_KEY,readLab,EMPTY_LAB} from "@/lib/hunterLab";
import {attributeXP,bonusForStreak,completionDays,getCoreSettings,exportLifeQuest,getHunterProgress,importLifeQuest,streakDays} from "@/lib/hunterCore";
import styles from "./HunterCore.module.css";
const EMPTY_EXTRA=extraDefault();
const labels={focus:"FOCUS",discipline:"DISCIPLINE",knowledge:"KNOWLEDGE",energy:"ENERGY",consistency:"CONSISTENCY"};
export default function HunterCorePage(){
 const system=useQuestSystem();const data=system.ready&&!system.error?system.data:null;
 const lab=useStoredData(LAB_KEY,readLab,EMPTY_LAB),extra=useStoredData(EXTRA_KEY,loadExtra,EMPTY_EXTRA);
 const focus=lab.data.sessions.reduce((n,s)=>n+s.minutes,0),bosses=extra.data.bosses.filter(b=>!!b.completedAt).length;
 const settings=data?getCoreSettings(data.totalXP):null;
 const [message,setMessage]=useState(''),[actionError,setError]=useState('');const error=system.error||lab.error||extra.error||actionError;
 const inputRef=useRef<HTMLInputElement>(null);
 const save=async()=>{try{const backup=await withStorageLock(()=>exportLifeQuest());const content=JSON.stringify(backup,null,2);const blob=new Blob([content],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`lifequest-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);setMessage("Sauvegarde exportée.")}catch(err){setError(String(err))}};
 const restore=async(e:ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;
  setMessage('');
  try{if(file.size>10_000_000)throw Error("Fichier trop volumineux");const raw=JSON.parse(await file.text()) as unknown;
  if(!window.confirm("Restaurer cette sauvegarde ? Les données actuelles seront remplacées. Exporte une copie avant de continuer."))return;
  await importLifeQuest(raw);setError("");setMessage("Import réussi. Tous les modules ont été actualisés.");}
  catch(err){setError(err instanceof Error?err.message:String(err))}};
 const totals=data?attributeXP(data.completions):null;
 const xp=data?.totalXP??0;const progress=data&&settings?getHunterProgress(xp,settings):null;
 const streak=data?streakDays(completionDays(data.completions)):0;
 const activity=data?.completions.slice(-15).reverse()??[];
 return <SystemShell title="HUNTER CORE" subtitle="ONE SYSTEM. REAL PROGRESSION."><section className={styles.page}>
  <header><span className={styles.eyebrow}>[ LIFEQUEST // CORE v011 ]</span><h1>HUNTER SYSTEM ENGINE</h1><p>Progression commune, statistiques réelles et sauvegarde de ta progression.</p></header>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{message&&<p role="status" className={styles.success}>{message}</p>}
  <div className={styles.tiles}>
   <article><span>LEVEL</span><strong>{progress?.level??"—"}</strong><small>{progress?`${Math.round(progress.current)} / ${progress.required} EXP vers le suivant`:"Chargement..."}</small></article>
   <article><span>TOTAL EXP</span><strong>{xp.toLocaleString("fr-FR")}</strong><small>Somme de toutes les activités</small></article>
   <article><span>HUNTER STABILITY</span><strong>{settings?.stability??"—"}%</strong><small>Pénalités désactivées : repos sans perte</small></article>
   <article><span>STREAK</span><strong>{streak} J</strong><small>Bonus actuel ×{bonusForStreak(streak).toFixed(2)}</small></article>
  </div>
  <div className={styles.grid}>
   <section className={styles.panel}><h2>REAL PLAYER ATTRIBUTES</h2><p>EXP réellement crédités dans chaque discipline.</p>{totals&&Object.entries(totals).map(([name,value])=><div className={styles.attr} key={name}><span>{labels[name as keyof typeof labels]}</span><div className={styles.track}><div style={{width:`${Math.min(100,value/Math.max(100,...Object.values(totals))*100)}%`}}/></div><b>{value} XP</b></div>)}</section>
   <section className={styles.panel}><h2>CORE OPERATIONS</h2><p>FOCUS : {focus} minutes enregistrées</p><p>BOSS CLEARED : {bosses}</p><p>Prochain niveau : {progress?.required??"—"} EXP (courbe globale recalculée).</p><p>Les EXP existants sont conservés. Tous les niveaux sont recalculés depuis le total EXP.</p><nav className={styles.links}><Link href="/hunter-lab">FOCUS DUNGEON</Link><Link href="/hunter-operations">BOSS MISSIONS</Link><Link href="/dashboard">STATUS WINDOW</Link></nav></section>
   <section className={styles.panel}><h2>SAVE & RESTORE</h2><p>Les données restent locales dans le navigateur. Exporte régulièrement une copie.</p><div className={styles.actions}><button onClick={save}>EXPORT JSON</button><button type="button" onClick={()=>inputRef.current?.click()}>IMPORT JSON</button><input ref={inputRef} aria-label="Fichier de sauvegarde LifeQuest" hidden type="file" accept="application/json,.json" onChange={restore}/></div><small>Import avec validation, confirmation et tentative de restauration en cas d’échec.</small></section>
   <section className={styles.panel}><h2>RECENT EXP HISTORY</h2><div className={styles.log}>{activity.map(c=><div key={c.id}><span>{c.questId.startsWith("lifequest:activity:")?c.questId.split(":")[2].toUpperCase():"QUEST"}</span><small>{new Date(c.completedAt).toLocaleDateString("fr-FR")}</small><strong>+{c.xpAwarded} EXP</strong></div>)}</div>{!activity.length&&<p>Aucune activité enregistrée.</p>}</section>
  </div></section></SystemShell>;
}
