"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import IntroCinematic from "./IntroCinematic";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Crown, Fingerprint, Play, Shield, SkipForward, Sparkles, Volume2, VolumeX, Zap } from "lucide-react";

type Avatar = "male" | "female";
type PlayerDraft = {
  name: string;
  age: string;
  gender: "male" | "female" | "other" | "prefer_not_to_say";
  avatar: Avatar;
  goals: string[];
};
const PROFILE_KEY = "lifequest-profile-v1";
const STEPS = ["THE CALL", "IDENTIFICATION", "AWAKENING", "YOUR PATH", "ACTIVATION"];
const GOALS = ["Études & apprentissage", "Développement de projets", "Sport & bien-être", "Lecture", "Concentration", "Gestion du temps"];
const VOICE_LINES = [
  "Le temps avance. Mais ton histoire reste à écrire.",
  "Ici, chaque effort devient une quête. Chaque victoire laisse une trace.",
  "Personne ne choisira ton chemin à ta place.",
  "Entre dans le System. Commence ton évolution."
];

export default function OnboardingExperience() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [hasVideo, setHasVideo] = useState(true);
  const [line, setLine] = useState(0);
  const [draft, setDraft] = useState<PlayerDraft>({name:"", age:"", gender:"prefer_not_to_say", avatar:"male", goals:[]});
  const [error, setError] = useState("");

  useEffect(() => {
    if (step !== 0 || !playing || hasVideo || reducedMotion) return;
    const id = window.setInterval(() => setLine(l => Math.min(l + 1, VOICE_LINES.length - 1)), 3400);
    return () => window.clearInterval(id);
  }, [step, playing, hasVideo, reducedMotion]);

  function startIntro() {
    setPlaying(true);
    if (hasVideo && videoRef.current) {
      void videoRef.current.play().catch(() => {setHasVideo(false);});
    }
  }
  function nextRegistration() {
    if (!draft.name.trim() || draft.name.trim().length > 40) { setError("Entre un nom ou pseudo (40 caractères maximum)."); return; }
    if (!/^\d+$/.test(draft.age) || Number(draft.age) < 13 || Number(draft.age) > 120) {setError("Entre un âge valide (13 à 120 ans pour cette démonstration).");return;}
    setError("");
    setStep(2);
  }
  function finish() {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({
        name:draft.name.trim(), age:Number(draft.age), gender:draft.gender,
        avatar:draft.avatar, goals:draft.goals, onboardingCompleted:true,
        createdAt:new Date().toISOString()
      }));
      // Never touch the lifequest-v2-demo key: existing XP and quests survive.
      router.replace("/activation");
    } catch { setError("Sauvegarde locale indisponible. Vérifie les paramètres du navigateur."); }
  }
  const canAdvanceGoals = draft.goals.length > 0;
  return <main className="ob-page">
    <div className="ob-aura ob-aura-one" aria-hidden="true"/><div className="ob-aura ob-aura-two" aria-hidden="true"/>
    <div className="ob-grid" aria-hidden="true"/>
    <header className="ob-header"><div className="ob-brand"><Shield size={25}/> LIFE<span>QUEST</span></div><div className="ob-header-side">THE AWAKENING PROTOCOL <span> // 004-A</span></div></header>
    <div className="ob-progress" aria-label={`Étape ${step+1} sur 5`}>
      {STEPS.map((s,i)=><div key={s} className={`ob-progress-item ${i<=step?"ob-progress-active":""}`}><span>{String(i+1).padStart(2,"0")}</span><small>{s}</small></div>)}
    </div>
    <AnimatePresence mode="wait">
      <motion.section key={step} className="ob-stage" initial={reducedMotion?false:{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={reducedMotion?undefined:{opacity:0,y:-18}} transition={{duration:.4}}>
        {step===0 && <IntroCinematic onComplete={() => setStep(1)} />}
        {step===1 && <div className="ob-form-layout"><div className="ob-aside"><Fingerprint size={42}/><span className="ob-tag">[ NEW PLAYER DETECTED ]</span><h1>IDENTIFIE<br/>TON HÉROS.</h1><p>Ton nom devient ton identité. Tes actions définiront ton niveau.</p><div className="ob-side-line"/></div><form className="ob-panel ob-form" onSubmit={e=>{e.preventDefault();nextRegistration();}}><span className="ob-tag">SYSTEM REGISTRATION // 01</span><h2>Player identification</h2><label htmlFor="ob-name">Nom ou pseudo</label><input id="ob-name" autoComplete="nickname" maxLength={40} value={draft.name} onChange={e=>setDraft(p=>({...p,name:e.target.value}))} placeholder="Ex. Night Hunter" required/><label htmlFor="ob-age">Âge</label><input id="ob-age" type="number" min="13" max="120" inputMode="numeric" value={draft.age} onChange={e=>setDraft(p=>({...p,age:e.target.value}))} placeholder="Ex. 22" required/><label htmlFor="ob-gender">Genre (facultatif pour le choix de l'avatar)</label><select id="ob-gender" value={draft.gender} onChange={e=>{const g=e.target.value as PlayerDraft["gender"];setDraft(p=>({...p,gender:g,avatar:g==="female"?"female":g==="male"?"male":p.avatar}));}}><option value="prefer_not_to_say">Je préfère ne pas préciser</option><option value="male">Homme</option><option value="female">Femme</option><option value="other">Autre</option></select><p className="ob-hint">Le genre ne limite pas le choix du personnage. Données enregistrées uniquement sur cet appareil pour cette version.</p>{error&&<p className="ob-error" role="alert">{error}</p>}<button className="ob-primary ob-full" type="submit">VALIDER L’IDENTITÉ <ArrowRight size={18}/></button></form></div>}
        {step===2 && <div className="ob-panel ob-reveal"><span className="ob-tag">[ CHARACTER SYNCHRONIZATION ]</span><h1>CHOISIS TON AVATAR</h1><p>Le System a identifié deux formes initiales. Tu pourras modifier ton choix plus tard.</p><div className="ob-avatars">{(["male","female"] as Avatar[]).map(a=><button type="button" key={a} className={`ob-avatar ${draft.avatar===a?"ob-avatar-selected":""} ${a==="female"?"ob-avatar-violet":""}`} onClick={()=>setDraft(p=>({...p,avatar:a}))}><div className="ob-avatar-figure"><span className="ob-avatar-halo"/><span className="ob-avatar-head"/><span className="ob-avatar-body"/><Sparkles className="ob-avatar-spark" size={26}/></div><strong>{a==="male"?"SHADOW HUNTER":"ASTRAL HUNTER"}</strong><small>{a==="male"?"CYAN AURA":"VIOLET AURA"}</small>{draft.avatar===a&&<span className="ob-selected"><Check size={14}/> SELECTED</span>}</button>)}</div><div className="ob-footer-actions"><button className="ob-text-btn" onClick={()=>setStep(1)}><ArrowLeft size={16}/> Retour</button><button className="ob-primary" onClick={()=>setStep(3)}>CONFIRMER LE HÉROS <ArrowRight size={18}/></button></div><p className="ob-hint">Les silhouettes sont des aperçus temporaires. Des illustrations anime originales seront ajoutées ensuite.</p></div>}
        {step===3 && <div className="ob-panel ob-goals"><span className="ob-tag">[ OBJECTIVE REGISTRATION ]</span><h1>QUELLE EST TA QUÊTE ?</h1><p>Choisis au moins un domaine à développer. Le System organisera tes missions autour de tes objectifs.</p><div className="ob-goal-grid">{GOALS.map(g=><button type="button" key={g} className={`ob-goal ${draft.goals.includes(g)?"ob-goal-selected":""}`} onClick={()=>setDraft(p=>({...p,goals:p.goals.includes(g)?p.goals.filter(x=>x!==g):[...p.goals,g]}))}><span>{draft.goals.includes(g)?<Check size={18}/>:<TargetIcon/>}</span>{g}</button>)}</div><div className="ob-footer-actions"><button className="ob-text-btn" onClick={()=>setStep(2)}><ArrowLeft size={16}/> Retour</button><button className="ob-primary" disabled={!canAdvanceGoals} onClick={()=>setStep(4)}>VALIDER MES QUÊTES <ArrowRight size={18}/></button></div></div>}
        {step===4 && <div className="ob-panel ob-activation"><motion.div animate={reducedMotion?{}:{scale:[1,1.08,1]}} transition={{repeat:Infinity,duration:3}} className="ob-activation-symbol"><Zap size={56}/></motion.div><span className="ob-tag">[ SYSTEM ACTIVATION READY ]</span><h1>BIENVENUE, {draft.name.trim().toUpperCase()}.</h1><p>Identité vérifiée. Personnage choisi. {draft.goals.length} domaine(s) de progression enregistré(s).</p><div className="ob-ready-stats"><span>INITIAL LEVEL <b>01</b></span><span>STARTING RANK <b>E</b></span><span>PLAYER STATUS <b>READY</b></span></div>{error&&<p className="ob-error" role="alert">{error}</p>}<div className="ob-footer-actions"><button className="ob-text-btn" onClick={()=>setStep(3)}><ArrowLeft size={16}/> Retour</button><button className="ob-primary" onClick={finish}>ACTIVER LE SYSTEM <Sparkles size={19}/></button></div></div>}
      </motion.section>
    </AnimatePresence>
    <footer className="ob-bottom"><span>© LIFEQUEST // REAL WORLD LEVELING</span><span>{String(step+1).padStart(2,"0")} / 05</span></footer>
  </main>;
}
function TargetIcon(){return <Crown size={18}/>;}
