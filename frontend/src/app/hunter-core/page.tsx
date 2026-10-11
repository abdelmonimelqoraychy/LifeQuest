"use client";
import {useEffect,useState,type ChangeEvent} from "react";
import Link from "next/link";
import SystemShell from "@/components/system/SystemShell";
import {loadState,type QuestSystemState} from "@/lib/questSystem";
import {EXTRA_KEY,type ExtraState} from "@/lib/hunterMissions";
import {LAB_KEY,type LabData} from "@/lib/hunterLab";
import {applyDailyStability,attributeXP,bonusForStreak,completionDays,ensureCoreSettings,exportLifeQuest,getHunterProgress,importLifeQuest,streakDays,type CoreSettings} from "@/lib/hunterCore";
import styles from "./HunterCore.module.css";
const labels={focus:"FOCUS",discipline:"DISCIPLINE",knowledge:"KNOWLEDGE",energy:"ENERGY",consistency:"CONSISTENCY"};
export default function HunterCorePage(){
 const [data,setData]=useState<QuestSystemState|null>(null);
 const [settings,setSettings]=useState<CoreSettings|null>(null);
 const [focus,setFocus]=useState(0);const [bosses,setBosses]=useState(0);
 const [message,setMessage]=useState("");const [error,setError]=useState("");
 const refresh=()=>{try{const q=loadState();ensureCoreSettings(q.totalXP);setSettings(applyDailyStability());setData(q);
  const lab=localStorage.getItem(LAB_KEY);const ex=localStorage.getItem(EXTRA_KEY);
  const l=lab?JSON.parse(lab) as LabData:null;const e=ex?JSON.parse(ex) as ExtraState:null;
  setFocus(l?.sessions?.reduce((x,s)=>x+(Number.isFinite(s.minutes)?s.minutes:0),0)??0);
  setBosses(e?.bosses?.filter(b=>!!b.completedAt).length??0);setError("");}
  catch(err){setError(err instanceof Error?err.message:String(err));}};
 useEffect(()=>{refresh();window.addEventListener("focus",refresh);window.addEventListener("lifequest-core-updated",refresh);return()=>{window.removeEventListener("focus",refresh);window.removeEventListener("lifequest-core-updated",refresh)}},[]);
 const save=()=>{try{const content=JSON.stringify(exportLifeQuest(),null,2);const blob=new Blob([content],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`lifequest-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);setMessage("Sauvegarde exportée.")}catch(err){setError(String(err))}};
 const restore=async(e:ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;
  try{if(file.size>10_000_000)throw Error("Fichier trop volumineux");const raw=JSON.parse(await file.text()) as unknown;
  if(!window.confirm("Restaurer cette sauvegarde ? Les données actuelles seront remplacées. Exporte une copie avant de continuer."))return;
  importLifeQuest(raw);setMessage("Import réussi. Recharge le navigateur pour actualiser tous les modules.");refresh();}
  catch(err){setError(err instanceof Error?err.message:String(err))}};
 const totals=data?attributeXP(data.completions):null;
 const xp=data?.totalXP??0;const progress=data&&settings?getHunterProgress(xp,settings):null;
 const streak=data?streakDays(completionDays(data.completions)):0;
 const activity=data?.completions.slice(-15).reverse()??[];
 return <SystemShell title="HUNTER CORE" subtitle="ONE SYSTEM. REAL PROGRESSION."><main className={styles.page}>
  <header><span className={styles.eyebrow}>[ LIFEQUEST // CORE v011 ]</span><h1>HUNTER SYSTEM ENGINE</h1><p>Progression commune, statistiques réelles et sauvegarde de ta progression.</p></header>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{message&&<p role="status" className={styles.success}>{message}</p>}
  <div className={styles.tiles}>
   <article><span>LEVEL</span><strong>{progress?.level??"—"}</strong><small>{progress?`${Math.round(progress.current)} / ${progress.required} EXP vers le suivant`:"Chargement..."}</small></article>
   <article><span>TOTAL EXP</span><strong>{xp.toLocaleString("fr-FR")}</strong><small>Somme de toutes les activités</small></article>
   <article><span>HUNTER STABILITY</span><strong>{settings?.stability??"—"}%</strong><small>Quêtes quotidiennes manquées : -10 HP</small></article>
   <article><span>STREAK</span><strong>{streak} J</strong><small>Bonus actuel ×{bonusForStreak(streak).toFixed(2)}</small></article>
  </div>
  <div className={styles.grid}>
   <section className={styles.panel}><h2>REAL PLAYER ATTRIBUTES</h2><p>EXP réellement crédités dans chaque discipline.</p>{totals&&Object.entries(totals).map(([name,value])=><div className={styles.attr} key={name}><span>{labels[name as keyof typeof labels]}</span><div className={styles.track}><div style={{width:`${Math.min(100,value/Math.max(100,...Object.values(totals))*100)}%`}}/></div><b>{value} XP</b></div>)}</section>
   <section className={styles.panel}><h2>CORE OPERATIONS</h2><p>FOCUS : {focus} minutes enregistrées</p><p>BOSS CLEARED : {bosses}</p><p>Prochain niveau : {progress?.required??"—"} EXP (courbe progressive après migration).</p><p>Les EXP existants et le niveau au moment de l’installation sont conservés.</p><nav className={styles.links}><Link href="/hunter-lab">FOCUS DUNGEON</Link><Link href="/hunter-operations">BOSS MISSIONS</Link><Link href="/dashboard">STATUS WINDOW</Link></nav></section>
   <section className={styles.panel}><h2>SAVE & RESTORE</h2><p>Les données restent locales dans le navigateur. Exporte régulièrement une copie.</p><div className={styles.actions}><button onClick={save}>EXPORT JSON</button><label className={styles.upload}>IMPORT JSON<input type="file" accept="application/json,.json" onChange={restore}/></label></div><small>Import avec validation, confirmation et tentative de restauration en cas d’échec.</small></section>
   <section className={styles.panel}><h2>RECENT EXP HISTORY</h2><div className={styles.log}>{activity.map(c=><div key={c.id}><span>{c.questId.startsWith("lifequest:activity:")?c.questId.split(":")[2].toUpperCase():"QUEST"}</span><small>{new Date(c.completedAt).toLocaleDateString("fr-FR")}</small><strong>+{c.xpAwarded} EXP</strong></div>)}</div>{!activity.length&&<p>Aucune activité enregistrée.</p>}</section>
  </div></main></SystemShell>;
}
