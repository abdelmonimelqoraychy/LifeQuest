'use client';
import { useRef, useState } from 'react';
import { createBossBattle, bossProgress, type BossMission } from '@/lib/hunterMissions';
import { progressBoss, claimBossReward } from '@/lib/activityRewards';
import ui from '@/app/hunter-operations/HunterOperations.module.css';
const initialGoals = [{ id: 'first', title: '', weight: 1 }];
export default function BossBattlePanel({ bosses, disabled }: { bosses: BossMission[]; disabled: boolean }) {
 const [title,setTitle]=useState(''),[goals,setGoals]=useState(initialGoals),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const working=useRef(false);
 async function run(action:()=>Promise<unknown>){
  if(disabled||working.current)return false;
  working.current=true;setBusy(true);
  try{await action();setError('');return true;}
  catch(e){setError(e instanceof Error?e.message:'Enregistrement impossible. Réessaie.');return false;}
  finally{working.current=false;setBusy(false);}
 }
 const total=goals.reduce((sum,g)=>sum+(Number.isFinite(g.weight)?g.weight:0),0);
 return <section className={ui.panel}><h2>BOSS BATTLES</h2><p>Découpe ton défi en sous-objectifs. Leur poids représente leur part de la progression. Tous doivent être validés pour recevoir la récompense finale.</p>
 {error&&<p role="alert" className={ui.error}>{error} Les données enregistrées sont conservées.</p>}
 <form className={ui.form} onSubmit={async e=>{e.preventDefault();if(await run(()=>createBossBattle({title,subObjectives:goals}))){setTitle('');setGoals(initialGoals);}}}>
 <label>TITRE DU BOSS<input aria-label="Boss mission title" required maxLength={80} value={title} disabled={busy||disabled} onChange={e=>setTitle(e.target.value)}/></label>
 {goals.map((goal,index)=><fieldset key={goal.id} className={ui.subObjectiveForm}><legend>Sous-objectif {index+1}</legend>
  <label>OBJECTIF<input aria-label={index===0?'Objective':'Sous-objectif '+(index+1)} required maxLength={120} value={goal.title} disabled={busy||disabled} onChange={e=>setGoals(items=>items.map(g=>g.id===goal.id?{...g,title:e.target.value}:g))}/></label>
  <label>POIDS<input aria-label={index===0?'Target count':'Poids '+(index+1)} type="number" required min={1} max={1000} step={1} value={Number.isNaN(goal.weight)?'':goal.weight} disabled={busy||disabled} onChange={e=>setGoals(items=>items.map(g=>g.id===goal.id?{...g,weight:e.target.value===''?NaN:Number(e.target.value)}:g))}/></label>
  {goals.length>1&&<button type="button" disabled={busy||disabled} onClick={()=>setGoals(items=>items.filter(g=>g.id!==goal.id))}>RETIRER LE SOUS-OBJECTIF {index+1}</button>}
 </fieldset>)}
 <button type="button" disabled={busy||disabled||goals.length>=20} onClick={()=>setGoals(items=>[...items,{id:crypto.randomUUID(),title:'',weight:1}])}>AJOUTER UN SOUS-OBJECTIF</button>
 <small>Poids total : {total}/1000 · Récompense de base : {Math.min(300,Math.max(25,total*10))} EXP. Bonus de régularité habituel appliqué.</small>
 <button disabled={busy||disabled}>REGISTER BOSS</button></form>
 {!bosses.length&&<p className={ui.muted}>Aucun Boss enregistré.</p>}
 {bosses.map(b=>{const progress=bossProgress(b);return <article className={ui.item} key={b.id}>
  <strong>{b.title}</strong><small>{b.completedAt?'TERMINÉ':'EN COURS'} · {progress.percent}% · Récompense : {b.xp} EXP de base</small>
  <div className={ui.track} role="progressbar" aria-label={'Progression de '+b.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}><div style={{width:progress.percent+'%'}}/></div>
  {b.subObjectives?<ul className={ui.subObjectives}>{b.subObjectives.map(g=><li key={g.id}><span>{g.title} · poids {g.weight}</span><button type="button" className={ui.small} disabled={busy||disabled||g.completed||!!b.completedAt} onClick={()=>void run(()=>progressBoss(b.id,g.id))}>{g.completed?'VALIDÉ':'VALIDER : '+g.title}</button></li>)}</ul>:<><small>{b.objective} · {b.current}/{b.target}</small>{!b.completedAt&&<button type="button" className={ui.small} disabled={busy||disabled} onClick={()=>void run(()=>progressBoss(b.id))}>+1 PROGRESS</button>}</>}
  {b.completedAt&&(b.rewardStatus==='resolved_without_xp'?<small>RÉSOLU SANS XP</small>:b.rewardStatus==='credited'?<small>EXP CRÉDITÉS</small>:<button type="button" className={ui.small} disabled={busy||disabled} onClick={()=>void run(()=>claimBossReward(b.id))}>{b.xp===0?'FINALISER SANS XP':'RÉCUPÉRER LES EXP'}</button>)}
 </article>})}</section>;
}
