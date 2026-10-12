"use client";

import {useMemo,useState} from "react";
import Link from "next/link";
import {BookOpen, BrainCircuit, Lightbulb, Network, NotebookPen, Sparkles, Trash2, ChartNoAxesCombined} from "lucide-react";
import SystemShell from "@/components/system/SystemShell";
import {EMPTY_LAB,LAB_KEY,PROMPTS,localDay,readLab,mutateLab,uid,type LabData,type MindNode} from "@/lib/hunterLab";
import css from "./HunterLab.module.css";
import {useStoredData} from '@/lib/useStoredData';
import {useLocalDay} from '@/lib/useLocalDay';
import {safeResourceUrl} from '@/lib/validation';
import {finishFocusSession} from '@/lib/activityRewards';
import FocusDungeon from '@/components/hunter/FocusDungeon';

type Tab="focus"|"ideas"|"creative"|"mind"|"library"|"journal"|"analytics";
const TABS:{id:Tab;label:string;Icon:typeof BrainCircuit}[]=[
 {id:"focus",label:"FOCUS DUNGEON",Icon:BrainCircuit},{id:"ideas",label:"IDEA VAULT",Icon:Lightbulb},
 {id:"creative",label:"CREATIVITY",Icon:Sparkles},{id:"mind",label:"MIND MAP",Icon:Network},
 {id:"library",label:"LIBRARY",Icon:BookOpen},{id:"journal",label:"JOURNAL",Icon:NotebookPen},
 {id:"analytics",label:"ANALYTICS",Icon:ChartNoAxesCombined}
];

export default function HunterLabPage(){
 const [tab,setTab]=useState<Tab>("focus");
 const {data,ready:loaded,error:loadError}=useStoredData(LAB_KEY,readLab,EMPTY_LAB);
 const [storageError,setStorageError]=useState("");
 const today=useLocalDay();
 const [journalDate,setJournalDate]=useState('');
 const [ideaTitle,setIdeaTitle]=useState("");const [ideaBody,setIdeaBody]=useState("");const [ideaTag,setIdeaTag]=useState("General");
 const [promptIndex,setPromptIndex]=useState(0);const [answer,setAnswer]=useState("");
 const [nodeTitle,setNodeTitle]=useState("");const [parent,setParent]=useState("");
 const selectedParent=data.nodes.some(n=>n.id===parent)?parent:"";
 // Reconcile this component's selection when an external-store snapshot loses it.
 // The guarded render adjustment resets only the parent, never the draft.
 if(loaded&&!loadError&&parent!==selectedParent)setParent(selectedParent);
 const [resourceTitle,setResourceTitle]=useState("");const [resourceNotes,setResourceNotes]=useState("");const [resourceUrl,setResourceUrl]=useState("");const [resourceTopic,setResourceTopic]=useState("General");
 const [wins,setWins]=useState("");const [challenges,setChallenges]=useState("");const [gratitude,setGratitude]=useState("");const [tomorrow,setTomorrow]=useState("");
 const [notice,setNotice]=useState("");
 async function update(fn:(old:LabData)=>LabData){if(!loaded||loadError)return false;try{await mutateLab(fn);setStorageError('');return true;}catch(e){setStorageError(e instanceof Error?e.message:'Enregistrement impossible');return false;}}
 function selectTab(next:Tab){setTab(next);setNotice('');if(next==='journal'&&!journalDate){setJournalDate(today);const j=data.journal.find(x=>x.date===today);if(j){setWins(j.wins);setChallenges(j.challenges);setGratitude(j.gratitude);setTomorrow(j.tomorrow);}}}
 const analytics=useMemo(()=>{
  const total=data.sessions.reduce((s,x)=>s+x.minutes,0);
  const days=new Set(data.sessions.map(s=>localDay(new Date(s.date))));
  const past= today ? Array.from({length:7},(_,i)=>{const d=new Date(`${today}T12:00:00`);d.setDate(d.getDate()-(6-i));const day=localDay(d);return {day,minutes:data.sessions.filter(s=>localDay(new Date(s.date))===day).reduce((s,x)=>s+x.minutes,0)}}) : [];
  return {total,days:days.size,past,max:Math.max(25,...past.map(x=>x.minutes))};
 },[data.sessions,today]);
 const addIdea=async()=>{if(!ideaTitle.trim())return;if(!await update(d=>({...d,ideas:[{id:uid(),title:ideaTitle.trim(),content:ideaBody.trim(),tag:ideaTag.trim()||"General",createdAt:new Date().toISOString(),archived:false},...d.ideas]})))return;setIdeaTitle("");setIdeaBody("")};
 const addNode=async()=>{
  if(!nodeTitle.trim())return;
  if(!await update(d=>{
   // A parent can disappear while this mutation waits for the shared lock.
   const parentId=d.nodes.some(n=>n.id===selectedParent)?selectedParent:null;
   return {...d,nodes:[...d.nodes,{id:uid(),title:nodeTitle.trim(),parentId,x:0,y:0}]};
  }))return;
  setNodeTitle("");
 };
 const addResource=async()=>{if(!resourceTitle.trim())return;const safeUrl=resourceUrl.trim();if(!safeResourceUrl(safeUrl)){setNotice("Seuls les liens http:// et https:// sont acceptes.");return}if(!await update(d=>({...d,resources:[{id:uid(),title:resourceTitle.trim(),notes:resourceNotes.trim(),url:safeUrl,topic:resourceTopic.trim()||"General",mastered:false,createdAt:new Date().toISOString()},...d.resources]})))return;setResourceTitle("");setResourceNotes("");setResourceUrl("")};
 const saveJournal=async()=>{const date=journalDate||today;if(!date)return;const ok=await update(d=>({...d,journal:[...d.journal.filter(j=>j.date!==date),{id:d.journal.find(j=>j.date===date)?.id||uid(),date,wins,challenges,gratitude,tomorrow}].sort((a,b)=>b.date.localeCompare(a.date))}));if(ok)setNotice('JOURNAL ENREGISTRÉ');};
 const completedCreative=data.challenges.filter(c=>c.completed).length;
 return <SystemShell title="HUNTER LAB" subtitle="FOCUS. CREATE. EVOLVE.">
  <section className={css.page}>
   <header className={css.intro}><div><div className={css.eyebrow}>[ SYSTEM // HUNTER LAB ]</div><h1>PRODUCTIVITY & CREATIVITY</h1><p>Sept outils pour entrainer ton attention, tes idees et tes competences.</p></div><Link href="/dashboard" className={css.back}>← STATUS WINDOW</Link></header>
   <nav className={css.tabs} aria-label="Hunter Lab modules">{TABS.map(({id,label,Icon})=><button type="button" key={id} className={`${css.tab} ${tab===id?css.active:""}`} aria-pressed={tab===id} onClick={()=>selectTab(id)}><Icon size={17}/>{label}</button>)}</nav>
   {(loadError||storageError)&&<p role="alert" className={css.error}>{loadError||storageError}</p>}
   {notice&&<div role="status" className={css.notice}>{notice}<button aria-label="Fermer la notification" type="button" onClick={()=>setNotice("")}>×</button></div>}
   {!loaded?<div className={css.panel}>SYSTEM LOADING...</div>:<fieldset className="module-fieldset" disabled={!!loadError}>
   {tab==="focus"&&<FocusDungeon/>}
   {tab==="ideas"&&<section className={css.panel}><h2><Lightbulb/> [ IDEA VAULT ]</h2><div className={css.form}><input aria-label="Titre de l’idée" placeholder="Titre de l'idee" value={ideaTitle} maxLength={100} onChange={e=>setIdeaTitle(e.target.value)}/><input aria-label="Catégorie ou projet" placeholder="Categorie ou projet" value={ideaTag} maxLength={60} onChange={e=>setIdeaTag(e.target.value)}/><textarea aria-label="Décris ton idée..." placeholder="Decris ton idee..." value={ideaBody} rows={4} onChange={e=>setIdeaBody(e.target.value)}/><button className={css.primary} disabled={!ideaTitle.trim()} onClick={addIdea}>SAVE IDEA</button></div><div className={css.cardGrid}>{data.ideas.map(idea=><article key={idea.id} className={css.item}><small>{idea.tag} · {new Date(idea.createdAt).toLocaleDateString()}</small><h3>{idea.title}</h3><p>{idea.content}</p><div className={css.actions}><button className={css.secondary} onClick={()=>update(d=>({...d,ideas:d.ideas.map(x=>x.id===idea.id?{...x,archived:!x.archived}:x)}))}>{idea.archived?"RESTORE":"ARCHIVE"}</button><button className={css.danger} aria-label={`Supprimer ${idea.title}`} onClick={()=>{if(window.confirm("Supprimer cette idee ?"))update(d=>({...d,ideas:d.ideas.filter(x=>x.id!==idea.id)}))}}><Trash2 size={16}/></button></div></article>)}</div>{!data.ideas.length&&<p className={css.hint}>Ton coffre est vide : ajoute ta première idée.</p>}</section>}
   {tab==="creative"&&<section className={css.panel}><h2><Sparkles/> [ CREATIVITY DUNGEON ]</h2><div className={css.challenge}><small>DAILY CREATIVE CHALLENGE</small><h3>{PROMPTS[promptIndex]}</h3><button className={css.secondary} onClick={()=>{setPromptIndex(x=>(x+1)%PROMPTS.length);setAnswer("")}}>NEW CHALLENGE</button></div><textarea aria-label="Réponse au défi créatif" value={answer} onChange={e=>setAnswer(e.target.value)} rows={6} placeholder="Ta reponse creative..."/><div className={css.actions}><button className={css.primary} disabled={!answer.trim()} onClick={async()=>{const ok=await update(d=>({...d,challenges:[{id:uid(),prompt:PROMPTS[promptIndex],response:answer.trim(),date:new Date().toISOString(),completed:true},...d.challenges]}));if(!ok)return;setAnswer("");setPromptIndex(x=>(x+1)%PROMPTS.length);setNotice("CREATIVE QUEST COMPLETE")}}>SUBMIT CREATION</button><span>{completedCreative} défis terminés</span></div><div className={css.cardGrid}>{data.challenges.slice(0,10).map(c=><article className={css.item} key={c.id}><small>{new Date(c.date).toLocaleDateString()}</small><h3>{c.prompt}</h3><p>{c.response}</p></article>)}</div></section>}
   {tab==="mind"&&<section className={css.panel}><h2><Network/> [ MIND MAP ]</h2><p className={css.hint}>Cree des noeuds relies par une idee parente. Cliquer sur un noeud pour en faire la prochaine branche.</p><div className={css.formLine}><input aria-label="Nouvelle idée ou branche" placeholder="Nouvelle idee / branche" value={nodeTitle} maxLength={90} onChange={e=>setNodeTitle(e.target.value)}/><select aria-label="Idée parente" value={selectedParent} onChange={e=>setParent(e.target.value)}><option value="">Racine</option>{data.nodes.map(n=><option key={n.id} value={n.id}>{n.title}</option>)}</select><button className={css.primary} onClick={addNode} disabled={!nodeTitle.trim()}>ADD NODE</button></div><MindCanvas nodes={data.nodes} onChoose={setParent} selected={selectedParent}/><div className={css.nodeList}>{data.nodes.map(n=><div className={css.nodeRow} key={n.id}><button className={css.secondary} onClick={()=>setParent(n.id)}>{n.title}</button><span>{n.parentId?`↳ ${data.nodes.find(p=>p.id===n.parentId)?.title||"Racine"}`:"ROOT"}</span><button className={css.danger} aria-label={`Supprimer ${n.title}`} onClick={()=>{if(window.confirm("Supprimer ce noeud et rattacher ses enfants a la racine ?"))update(d=>({...d,nodes:d.nodes.filter(x=>x.id!==n.id).map(x=>x.parentId===n.id?{...x,parentId:null}:x)}))}}><Trash2 size={15}/></button></div>)}</div></section>}
   {tab==="library"&&<section className={css.panel}><h2><BookOpen/> [ KNOWLEDGE LIBRARY ]</h2><div className={css.form}><input aria-label="Notion ou ressource" placeholder="Notion / ressource" value={resourceTitle} maxLength={110} onChange={e=>setResourceTitle(e.target.value)}/><input aria-label="Sujet" placeholder="Sujet" value={resourceTopic} onChange={e=>setResourceTopic(e.target.value)}/><input aria-label="Lien de la ressource" placeholder="Lien facultatif https://..." value={resourceUrl} onChange={e=>setResourceUrl(e.target.value)}/><textarea aria-label="Notes et enseignements" rows={3} placeholder="Notes et enseignements" value={resourceNotes} onChange={e=>setResourceNotes(e.target.value)}/><button className={css.primary} disabled={!resourceTitle.trim()} onClick={addResource}>SAVE KNOWLEDGE</button></div><div className={css.cardGrid}>{data.resources.map(r=><article className={css.item} key={r.id}><small>{r.topic} · {r.mastered?"MASTERED":"LEARNING"}</small><h3>{r.title}</h3><p>{r.notes}</p>{r.url&&<a href={r.url} target="_blank" rel="noopener noreferrer">OPEN RESOURCE ↗</a>}<div className={css.actions}><button className={css.secondary} onClick={()=>update(d=>({...d,resources:d.resources.map(x=>x.id===r.id?{...x,mastered:!x.mastered}:x)}))}>{r.mastered?"MARK LEARNING":"MARK MASTERED"}</button><button aria-label={`Supprimer ${r.title}`} className={css.danger} onClick={()=>{if(window.confirm("Supprimer cette ressource ?"))update(d=>({...d,resources:d.resources.filter(x=>x.id!==r.id)}))}}><Trash2 size={16}/></button></div></article>)}</div></section>}
   {tab==="journal"&&<section className={css.panel}><h2><NotebookPen/> [ HUNTER JOURNAL ]</h2><label className={css.field}>Date du journal<input type="date" max={today||undefined} value={journalDate||today} onChange={e=>{if((wins||challenges||gratitude||tomorrow)&&!window.confirm("Changer de date ? Les modifications non enregistrées de ce brouillon seront abandonnées."))return;const date=e.target.value;setJournalDate(date);const j=data.journal.find(x=>x.date===date);setWins(j?.wins||"");setChallenges(j?.challenges||"");setGratitude(j?.gratitude||"");setTomorrow(j?.tomorrow||"");}}/></label><p className={css.hint}>Bilan du {journalDate||today} — une entree par jour, modifiable.</p><div className={css.form}><label className={css.field}>VICTORIES<textarea rows={3} placeholder="Mes victoires d'aujourd'hui" value={wins} onChange={e=>setWins(e.target.value)}/></label><label className={css.field}>CHALLENGES<textarea rows={3} placeholder="Difficultes et enseignements" value={challenges} onChange={e=>setChallenges(e.target.value)}/></label><label className={css.field}>GRATITUDE<textarea rows={2} placeholder="Ce que j'apprecie" value={gratitude} onChange={e=>setGratitude(e.target.value)}/></label><label className={css.field}>TOMORROW<textarea rows={2} placeholder="Ma priorite demain" value={tomorrow} onChange={e=>setTomorrow(e.target.value)}/></label><button className={css.primary} onClick={saveJournal}>SAVE DAILY JOURNAL</button></div><div className={css.cardGrid}>{data.journal.map(j=><article className={css.item} key={j.id}><small>{j.date}</small><h3>HUNTER LOG</h3><p><b>Victories:</b> {j.wins}</p><p><b>Challenges:</b> {j.challenges}</p><p><b>Gratitude:</b> {j.gratitude}</p><p><b>Tomorrow:</b> {j.tomorrow}</p><button aria-label={`Supprimer le journal du ${j.date}`} className={css.danger} onClick={()=>{if(window.confirm("Supprimer ce journal ?"))update(d=>({...d,journal:d.journal.filter(x=>x.id!==j.id)}))}}><Trash2 size={16}/></button></article>)}</div></section>}
   {tab==="analytics"&&<section className={css.panel}><h2><BrainCircuit/> [ DEEP WORK ANALYTICS ]</h2><div className={css.summary}><div><small>FOCUS MINUTES</small><strong>{analytics.total}</strong></div><div><small>SESSIONS</small><strong>{data.sessions.length}</strong></div><div><small>ACTIVE DAYS</small><strong>{analytics.days}</strong></div><div><small>IDEAS</small><strong>{data.ideas.length}</strong></div><div><small>CREATIVE QUESTS</small><strong>{completedCreative}</strong></div></div><h3>LAST 7 DAYS · FOCUS MINUTES</h3><div className={css.chart}>{analytics.past.map(day=><div key={day.day} className={css.barCol}><strong>{day.minutes}</strong><div className={css.barSpace}><div style={{height:`${100*day.minutes/analytics.max}%`}}/></div><small>{day.day.slice(5)}</small></div>)}</div><h3>RECENT SESSIONS</h3><div className={css.nodeList}>{data.sessions.slice(-20).reverse().map(s=><div className={css.nodeRow} key={s.id}><span>{new Date(s.date).toLocaleString()}</span><strong>{s.label}</strong><span>{s.minutes} min</span>{s.rewardStatus==="pending"&&<button onClick={async()=>{try{await finishFocusSession(s);setNotice("Récompense Focus récupérée");}catch(e){setStorageError(String(e));}}}>RÉESSAYER LA RÉCOMPENSE</button>}</div>)}</div>{!data.sessions.length&&<p className={css.hint}>Termine ta première session Pomodoro pour afficher les statistiques.</p>}</section>}
   </fieldset>}
   <footer className={css.footer}>LIFEQUEST HUNTER LAB · Les donnees sont stockees dans ce navigateur. Pense a les sauvegarder avant de changer d’appareil. <span>{LAB_KEY}</span></footer>
  </section>
 </SystemShell>;
}
function MindCanvas({nodes,onChoose,selected}:{nodes:MindNode[];onChoose:(id:string)=>void;selected:string}){
 const width=900,height=Math.max(300,Math.ceil(nodes.length/5)*130+80);
 const located=nodes.map((n,i)=>({...n,x:100+(i%5)*173,y:70+Math.floor(i/5)*130}));
 const byId=new Map(located.map(n=>[n.id,n]));
 return <div className={css.mindScroll}><svg viewBox={`0 0 ${width} ${height}`} style={{minWidth:Math.min(width,Math.max(520,nodes.length*110)),height:"auto",width:"100%"}} role="img" aria-label="Carte mentale des idees et relations">{located.map(n=>{const p=byId.get(n.parentId||"");return p?<line key={`edge-${n.id}`} x1={p.x} y1={p.y} x2={n.x} y2={n.y} stroke="#4ccfff" strokeWidth="2" opacity=".65"/>:null})}{located.map(n=><g key={n.id}><rect x={n.x-73} y={n.y-27} width="146" height="54" rx="9" fill={selected===n.id?"#184c72":"#08253e"} stroke={selected===n.id?"#e0faff":"#46b9ef"} strokeWidth="2"/><text x={n.x} y={n.y-3} fill="#dcf7ff" textAnchor="middle" fontSize="11">{n.title.length>21?n.title.slice(0,20)+"…":n.title}</text><text x={n.x} y={n.y+15} fill="#81b8d6" fontSize="9" textAnchor="middle">{n.parentId?"BRANCH":"ROOT"}</text></g>)}</svg>{!nodes.length&&<p className={css.hint}>Ajoute une idee racine pour commencer.</p>}<div className={css.nodePicker}>{nodes.map(n=><button key={n.id} onClick={()=>onChoose(n.id)} className={selected===n.id?css.selected:css.secondary}>{n.title}</button>)}</div></div>
}
