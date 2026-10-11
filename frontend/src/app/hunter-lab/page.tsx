"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {BookOpen, BrainCircuit, Check, Clock3, Lightbulb, Network, NotebookPen, Pause, Play, RotateCcw, Sparkles, Trash2, ChartNoAxesCombined} from "lucide-react";
import SystemShell from "@/components/system/SystemShell";
import {EMPTY_LAB,LAB_KEY,PROMPTS,localDay,readLab,saveLab,uid,type LabData,type MindNode} from "@/lib/hunterLab";
import css from "./HunterLab.module.css";
import { awardActivityXP } from "@/lib/hunterCore";

type Tab="focus"|"ideas"|"creative"|"mind"|"library"|"journal"|"analytics";
type TimerData={mode:"focus"|"short"|"long";secondsLeft:number;runningUntil:number|null;label:string};
const TIMER_KEY="lifequest-hunter-timer-v1";
const DURATIONS={focus:25*60,short:5*60,long:15*60};
const TABS:{id:Tab;label:string;Icon:typeof Clock3}[]=[
 {id:"focus",label:"FOCUS DUNGEON",Icon:Clock3},{id:"ideas",label:"IDEA VAULT",Icon:Lightbulb},
 {id:"creative",label:"CREATIVITY",Icon:Sparkles},{id:"mind",label:"MIND MAP",Icon:Network},
 {id:"library",label:"LIBRARY",Icon:BookOpen},{id:"journal",label:"JOURNAL",Icon:NotebookPen},
 {id:"analytics",label:"ANALYTICS",Icon:ChartNoAxesCombined}
];
const fmt=(s:number)=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

export default function HunterLabPage(){
 const [tab,setTab]=useState<Tab>("focus");
 const [data,setData]=useState<LabData>(EMPTY_LAB);
 const [loaded,setLoaded]=useState(false);
 const [storageError,setStorageError]=useState("");
 const [timer,setTimer]=useState<TimerData>({mode:"focus",secondsLeft:1500,runningUntil:null,label:"Deep Work"});
 const [now,setNow]=useState(0);
 const [today,setToday]=useState("");
 const [ideaTitle,setIdeaTitle]=useState("");const [ideaBody,setIdeaBody]=useState("");const [ideaTag,setIdeaTag]=useState("General");
 const [promptIndex,setPromptIndex]=useState(0);const [answer,setAnswer]=useState("");
 const [nodeTitle,setNodeTitle]=useState("");const [parent,setParent]=useState("");
 const [resourceTitle,setResourceTitle]=useState("");const [resourceNotes,setResourceNotes]=useState("");const [resourceUrl,setResourceUrl]=useState("");const [resourceTopic,setResourceTopic]=useState("General");
 const [wins,setWins]=useState("");const [challenges,setChallenges]=useState("");const [gratitude,setGratitude]=useState("");const [tomorrow,setTomorrow]=useState("");
 const [notice,setNotice]=useState("");
 useEffect(()=>{
   try{setData(readLab());const raw=localStorage.getItem(TIMER_KEY);if(raw){const t=JSON.parse(raw) as Partial<TimerData>;if((t.mode==="focus"||t.mode==="short"||t.mode==="long")&&typeof t.secondsLeft==="number"&&t.secondsLeft>=0&&t.secondsLeft<=86400){setTimer({mode:t.mode,secondsLeft:t.secondsLeft,runningUntil:typeof t.runningUntil==="number"?t.runningUntil:null,label:typeof t.label==="string"?t.label:"Deep Work"});}}}
   catch{setStorageError("Stockage local indisponible. Aucune donnee existante n'a ete effacee.");}
   setToday(localDay());setNow(Date.now());setLoaded(true);
 },[]);
 useEffect(()=>{if(!loaded)return;try{saveLab(data);setStorageError("")}catch{setStorageError("Impossible d'enregistrer. Verifie l'espace disponible dans le navigateur.")}},[data,loaded]);
 useEffect(()=>{if(!loaded)return;try{localStorage.setItem(TIMER_KEY,JSON.stringify(timer))}catch{setStorageError("Impossible d'enregistrer le minuteur.")}},[timer,loaded]);
 useEffect(()=>{if(!timer.runningUntil)return;const tick=()=>setNow(Date.now());tick();const interval=window.setInterval(tick,500);return()=>window.clearInterval(interval)},[timer.runningUntil]);
 const left=timer.runningUntil===null?timer.secondsLeft:Math.max(0,Math.ceil((timer.runningUntil-now)/1000));
 const update=useCallback((fn:(old:LabData)=>LabData)=>setData(fn),[]);
 const finish=()=>{
   if(!timer.runningUntil||left>0)return;
   // A session is rewarded only if a focus timer truly elapsed. Re-check timestamp at completion.
   if(Date.now()<timer.runningUntil)return;
   if(timer.mode==="focus"){
      const mins=Math.round(DURATIONS.focus/60);
      const focusId=uid();
      update(d=>({...d,sessions:[...d.sessions,{id:focusId,date:new Date().toISOString(),minutes:mins,label:timer.label.trim()||"Deep Work"}]}));
      try{const earned=awardActivityXP("focus",focusId,20,"focus");setNotice(`FOCUS COMPLETE : +${earned.xp} EXP`)}catch(e){setStorageError(e instanceof Error?e.message:"Crédit EXP indisponible")};
      
   }else setNotice("PAUSE TERMINEE");
   setTimer(t=>({...t,runningUntil:null,secondsLeft:DURATIONS[t.mode]}));
 };
 useEffect(()=>{if(timer.runningUntil!==null&&now>0&&left===0)finish(); // eslint-disable-next-line react-hooks/exhaustive-deps
 },[left,now,timer.runningUntil]);
 const mode=(m:TimerData["mode"])=>{setTimer(t=>({...t,mode:m,secondsLeft:DURATIONS[m],runningUntil:null}));setNotice("")};
 const toggleTimer=()=>setTimer(t=>t.runningUntil===null?{...t,runningUntil:Date.now()+t.secondsLeft*1000}:{...t,secondsLeft:Math.max(0,Math.ceil((t.runningUntil-Date.now())/1000)),runningUntil:null});
 const journalToday=data.journal.find(j=>j.date===today);
 useEffect(()=>{if(!loaded)return;const j=data.journal.find(e=>e.date===localDay());if(j){setWins(j.wins);setChallenges(j.challenges);setGratitude(j.gratitude);setTomorrow(j.tomorrow)}},[loaded]); // do not overwrite unsaved edits on each data change
 const analytics=useMemo(()=>{
  const total=data.sessions.reduce((s,x)=>s+x.minutes,0);
  const days=new Set(data.sessions.map(s=>localDay(new Date(s.date))));
  const past= today ? Array.from({length:7},(_,i)=>{const d=new Date(`${today}T12:00:00`);d.setDate(d.getDate()-(6-i));const day=localDay(d);return {day,minutes:data.sessions.filter(s=>localDay(new Date(s.date))===day).reduce((s,x)=>s+x.minutes,0)}}) : [];
  return {total,days:days.size,past,max:Math.max(25,...past.map(x=>x.minutes))};
 },[data.sessions,today]);
 const addIdea=()=>{if(!ideaTitle.trim())return;update(d=>({...d,ideas:[{id:uid(),title:ideaTitle.trim(),content:ideaBody.trim(),tag:ideaTag.trim()||"General",createdAt:new Date().toISOString(),archived:false},...d.ideas]}));setIdeaTitle("");setIdeaBody("")};
 const addNode=()=>{if(!nodeTitle.trim())return;update(d=>({...d,nodes:[...d.nodes,{id:uid(),title:nodeTitle.trim(),parentId:parent||null,x:0,y:0}]}));setNodeTitle("")};
 const addResource=()=>{if(!resourceTitle.trim())return;const safeUrl=resourceUrl.trim();if(safeUrl&&!/^https?:\/\//i.test(safeUrl)){setNotice("Seuls les liens http:// et https:// sont acceptes.");return}update(d=>({...d,resources:[{id:uid(),title:resourceTitle.trim(),notes:resourceNotes.trim(),url:safeUrl,topic:resourceTopic.trim()||"General",mastered:false,createdAt:new Date().toISOString()},...d.resources]}));setResourceTitle("");setResourceNotes("");setResourceUrl("")};
 const saveJournal=()=>{const date=localDay();update(d=>({...d,journal:[...d.journal.filter(j=>j.date!==date),{id:journalToday?.id||uid(),date,wins,challenges,gratitude,tomorrow}].sort((a,b)=>b.date.localeCompare(a.date))}));setNotice("JOURNAL ENREGISTRE")};
 const completedCreative=data.challenges.filter(c=>c.completed).length;
 return <SystemShell title="HUNTER LAB" subtitle="FOCUS. CREATE. EVOLVE.">
  <main className={css.page}>
   <header className={css.intro}><div><div className={css.eyebrow}>[ SYSTEM // HUNTER LAB ]</div><h1>PRODUCTIVITY & CREATIVITY</h1><p>Sept outils pour entrainer ton attention, tes idees et tes competences.</p></div><Link href="/dashboard" className={css.back}>← STATUS WINDOW</Link></header>
   <nav className={css.tabs} aria-label="Hunter Lab modules">{TABS.map(({id,label,Icon})=><button type="button" key={id} className={`${css.tab} ${tab===id?css.active:""}`} onClick={()=>{setTab(id);setNotice("")}}><Icon size={17}/>{label}</button>)}</nav>
   {storageError&&<p role="alert" className={css.error}>{storageError}</p>}
   {notice&&<div role="status" className={css.notice}>{notice}<button type="button" onClick={()=>setNotice("")}>×</button></div>}
   {!loaded?<div className={css.panel}>SYSTEM LOADING...</div>:<>
   {tab==="focus"&&<section className={css.panel}><h2><Clock3/> [ FOCUS DUNGEON ]</h2><div className={css.modeRow}>{(["focus","short","long"] as const).map(m=><button key={m} className={`${css.mode} ${timer.mode===m?css.selected:""}`} onClick={()=>mode(m)}>{m==="focus"?"FOCUS · 25 MIN":m==="short"?"SHORT REST · 5 MIN":"LONG REST · 15 MIN"}</button>)}</div><div className={css.timer} aria-live="off">{fmt(left)}</div><label className={css.field}>SESSION LABEL<input value={timer.label} maxLength={80} onChange={e=>setTimer(t=>({...t,label:e.target.value}))} placeholder="Objectif de la session"/></label><div className={css.actions}><button className={css.primary} onClick={toggleTimer} disabled={left===0}>{timer.runningUntil?<><Pause size={18}/> PAUSE</>:<><Play size={18}/> START / RESUME</>}</button><button className={css.secondary} onClick={()=>setTimer(t=>({...t,runningUntil:null,secondsLeft:DURATIONS[t.mode]}))}><RotateCcw size={17}/> RESET</button>{left===0&&<button className={css.primary} onClick={finish}>COMPLETE SESSION</button>}</div><p className={css.hint}>Une session Focus terminee est ajoutee aux statistiques. +20 EXP Focus (avant bonus de streak) pour une session validee. Les interruptions ne donnent aucune recompense.</p></section>}
   {tab==="ideas"&&<section className={css.panel}><h2><Lightbulb/> [ IDEA VAULT ]</h2><div className={css.form}><input placeholder="Titre de l'idee" value={ideaTitle} maxLength={100} onChange={e=>setIdeaTitle(e.target.value)}/><input placeholder="Categorie ou projet" value={ideaTag} maxLength={60} onChange={e=>setIdeaTag(e.target.value)}/><textarea placeholder="Decris ton idee..." value={ideaBody} rows={4} onChange={e=>setIdeaBody(e.target.value)}/><button className={css.primary} disabled={!ideaTitle.trim()} onClick={addIdea}>SAVE IDEA</button></div><div className={css.cardGrid}>{data.ideas.map(idea=><article key={idea.id} className={css.item}><small>{idea.tag} · {new Date(idea.createdAt).toLocaleDateString()}</small><h3>{idea.title}</h3><p>{idea.content}</p><div className={css.actions}><button className={css.secondary} onClick={()=>update(d=>({...d,ideas:d.ideas.map(x=>x.id===idea.id?{...x,archived:!x.archived}:x)}))}>{idea.archived?"RESTORE":"ARCHIVE"}</button><button className={css.danger} aria-label={`Supprimer ${idea.title}`} onClick={()=>{if(window.confirm("Supprimer cette idee ?"))update(d=>({...d,ideas:d.ideas.filter(x=>x.id!==idea.id)}))}}><Trash2 size={16}/></button></div></article>)}</div>{!data.ideas.length&&<p className={css.hint}>Ton coffre est vide : ajoute ta premiere idee.</p>}</section>}
   {tab==="creative"&&<section className={css.panel}><h2><Sparkles/> [ CREATIVITY DUNGEON ]</h2><div className={css.challenge}><small>DAILY CREATIVE CHALLENGE</small><h3>{PROMPTS[promptIndex]}</h3><button className={css.secondary} onClick={()=>{setPromptIndex(x=>(x+1)%PROMPTS.length);setAnswer("")}}>NEW CHALLENGE</button></div><textarea value={answer} onChange={e=>setAnswer(e.target.value)} rows={6} placeholder="Ta reponse creative..."/><div className={css.actions}><button className={css.primary} disabled={!answer.trim()} onClick={()=>{update(d=>({...d,challenges:[{id:uid(),prompt:PROMPTS[promptIndex],response:answer.trim(),date:new Date().toISOString(),completed:true},...d.challenges]}));setAnswer("");setPromptIndex(x=>(x+1)%PROMPTS.length);setNotice("CREATIVE QUEST COMPLETE")}}>SUBMIT CREATION</button><span>{completedCreative} défis terminés</span></div><div className={css.cardGrid}>{data.challenges.slice(0,10).map(c=><article className={css.item} key={c.id}><small>{new Date(c.date).toLocaleDateString()}</small><h3>{c.prompt}</h3><p>{c.response}</p></article>)}</div></section>}
   {tab==="mind"&&<section className={css.panel}><h2><Network/> [ MIND MAP ]</h2><p className={css.hint}>Cree des noeuds relies par une idee parente. Cliquer sur un noeud pour en faire la prochaine branche.</p><div className={css.formLine}><input placeholder="Nouvelle idee / branche" value={nodeTitle} maxLength={90} onChange={e=>setNodeTitle(e.target.value)}/><select value={parent} onChange={e=>setParent(e.target.value)}><option value="">Racine</option>{data.nodes.map(n=><option key={n.id} value={n.id}>{n.title}</option>)}</select><button className={css.primary} onClick={addNode} disabled={!nodeTitle.trim()}>ADD NODE</button></div><MindCanvas nodes={data.nodes} onChoose={setParent} selected={parent}/><div className={css.nodeList}>{data.nodes.map(n=><div className={css.nodeRow} key={n.id}><button className={css.secondary} onClick={()=>setParent(n.id)}>{n.title}</button><span>{n.parentId?`↳ ${data.nodes.find(p=>p.id===n.parentId)?.title||"Racine"}`:"ROOT"}</span><button className={css.danger} aria-label={`Supprimer ${n.title}`} onClick={()=>{if(window.confirm("Supprimer ce noeud et rattacher ses enfants a la racine ?"))update(d=>({...d,nodes:d.nodes.filter(x=>x.id!==n.id).map(x=>x.parentId===n.id?{...x,parentId:null}:x)}))}}><Trash2 size={15}/></button></div>)}</div></section>}
   {tab==="library"&&<section className={css.panel}><h2><BookOpen/> [ KNOWLEDGE LIBRARY ]</h2><div className={css.form}><input placeholder="Notion / ressource" value={resourceTitle} maxLength={110} onChange={e=>setResourceTitle(e.target.value)}/><input placeholder="Sujet" value={resourceTopic} onChange={e=>setResourceTopic(e.target.value)}/><input placeholder="Lien facultatif https://..." value={resourceUrl} onChange={e=>setResourceUrl(e.target.value)}/><textarea rows={3} placeholder="Notes et enseignements" value={resourceNotes} onChange={e=>setResourceNotes(e.target.value)}/><button className={css.primary} disabled={!resourceTitle.trim()} onClick={addResource}>SAVE KNOWLEDGE</button></div><div className={css.cardGrid}>{data.resources.map(r=><article className={css.item} key={r.id}><small>{r.topic} · {r.mastered?"MASTERED":"LEARNING"}</small><h3>{r.title}</h3><p>{r.notes}</p>{r.url&&<a href={r.url} target="_blank" rel="noopener noreferrer">OPEN RESOURCE ↗</a>}<div className={css.actions}><button className={css.secondary} onClick={()=>update(d=>({...d,resources:d.resources.map(x=>x.id===r.id?{...x,mastered:!x.mastered}:x)}))}>{r.mastered?"MARK LEARNING":"MARK MASTERED"}</button><button className={css.danger} onClick={()=>{if(window.confirm("Supprimer cette ressource ?"))update(d=>({...d,resources:d.resources.filter(x=>x.id!==r.id)}))}}><Trash2 size={16}/></button></div></article>)}</div></section>}
   {tab==="journal"&&<section className={css.panel}><h2><NotebookPen/> [ HUNTER JOURNAL ]</h2><p className={css.hint}>Bilan du {today} — une entree par jour, modifiable.</p><div className={css.form}><label className={css.field}>VICTORIES<textarea rows={3} placeholder="Mes victoires d'aujourd'hui" value={wins} onChange={e=>setWins(e.target.value)}/></label><label className={css.field}>CHALLENGES<textarea rows={3} placeholder="Difficultes et enseignements" value={challenges} onChange={e=>setChallenges(e.target.value)}/></label><label className={css.field}>GRATITUDE<textarea rows={2} placeholder="Ce que j'apprecie" value={gratitude} onChange={e=>setGratitude(e.target.value)}/></label><label className={css.field}>TOMORROW<textarea rows={2} placeholder="Ma priorite demain" value={tomorrow} onChange={e=>setTomorrow(e.target.value)}/></label><button className={css.primary} onClick={saveJournal}>SAVE DAILY JOURNAL</button></div><div className={css.cardGrid}>{data.journal.map(j=><article className={css.item} key={j.id}><small>{j.date}</small><h3>HUNTER LOG</h3><p><b>Victories:</b> {j.wins}</p><p><b>Challenges:</b> {j.challenges}</p><p><b>Gratitude:</b> {j.gratitude}</p><p><b>Tomorrow:</b> {j.tomorrow}</p><button className={css.danger} onClick={()=>{if(window.confirm("Supprimer ce journal ?"))update(d=>({...d,journal:d.journal.filter(x=>x.id!==j.id)}))}}><Trash2 size={16}/></button></article>)}</div></section>}
   {tab==="analytics"&&<section className={css.panel}><h2><BrainCircuit/> [ DEEP WORK ANALYTICS ]</h2><div className={css.summary}><div><small>FOCUS MINUTES</small><strong>{analytics.total}</strong></div><div><small>SESSIONS</small><strong>{data.sessions.length}</strong></div><div><small>ACTIVE DAYS</small><strong>{analytics.days}</strong></div><div><small>IDEAS</small><strong>{data.ideas.length}</strong></div><div><small>CREATIVE QUESTS</small><strong>{completedCreative}</strong></div></div><h3>LAST 7 DAYS · FOCUS MINUTES</h3><div className={css.chart}>{analytics.past.map(day=><div key={day.day} className={css.barCol}><strong>{day.minutes}</strong><div className={css.barSpace}><div style={{height:`${100*day.minutes/analytics.max}%`}}/></div><small>{day.day.slice(5)}</small></div>)}</div><h3>RECENT SESSIONS</h3><div className={css.nodeList}>{data.sessions.slice(-20).reverse().map(s=><div className={css.nodeRow} key={s.id}><span>{new Date(s.date).toLocaleString()}</span><strong>{s.label}</strong><span>{s.minutes} min</span></div>)}</div>{!data.sessions.length&&<p className={css.hint}>Termine ta premiere session Pomodoro pour afficher les statistiques.</p>}</section>}
   </>}
   <footer className={css.footer}>LIFEQUEST HUNTER LAB · Les donnees sont stockees dans ce navigateur. Pense a les sauvegarder avant de changer d'appareil. <span>{LAB_KEY}</span></footer>
  </main>
 </SystemShell>;
}
function MindCanvas({nodes,onChoose,selected}:{nodes:MindNode[];onChoose:(id:string)=>void;selected:string}){
 const width=900,height=Math.max(300,Math.ceil(nodes.length/5)*130+80);
 const located=nodes.map((n,i)=>({...n,x:100+(i%5)*173,y:70+Math.floor(i/5)*130}));
 return <div className={css.mindScroll}><svg viewBox={`0 0 ${width} ${height}`} style={{minWidth:Math.min(width,Math.max(520,nodes.length*110)),height:"auto",width:"100%"}} role="img" aria-label="Carte mentale des idees et relations">{located.map(n=>{const p=located.find(x=>x.id===n.parentId);return p?<line key={`edge-${n.id}`} x1={p.x} y1={p.y} x2={n.x} y2={n.y} stroke="#4ccfff" strokeWidth="2" opacity=".65"/>:null})}{located.map(n=><g key={n.id}><rect x={n.x-73} y={n.y-27} width="146" height="54" rx="9" fill={selected===n.id?"#184c72":"#08253e"} stroke={selected===n.id?"#e0faff":"#46b9ef"} strokeWidth="2"/><text x={n.x} y={n.y-3} fill="#dcf7ff" textAnchor="middle" fontSize="11">{n.title.length>21?n.title.slice(0,20)+"…":n.title}</text><text x={n.x} y={n.y+15} fill="#81b8d6" fontSize="9" textAnchor="middle">{n.parentId?"BRANCH":"ROOT"}</text></g>)}</svg>{!nodes.length&&<p className={css.hint}>Ajoute une idee racine pour commencer.</p>}<div className={css.nodePicker}>{nodes.map(n=><button key={n.id} onClick={()=>onChoose(n.id)} className={selected===n.id?css.selected:css.secondary}>{n.title}</button>)}</div></div>
}
