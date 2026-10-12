"use client";
import Modal from '@/components/ui/Modal';

import Image from "next/image";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Brain, Check, ClipboardCheck, Crown, Flame, Focus, HeartPulse, Repeat2, Shield, Target, UserRound, Zap } from "lucide-react";
import LevelCinematicGate, {usePendingCinematic} from "@/components/cinematics/LevelCinematicGate";
import HunterTransition from "@/components/hunter/HunterTransition";
import SystemShell from "@/components/system/SystemShell";
import {rankForLevel} from "@/lib/hunterMissions";
import {readProfile,PROFILE_KEY} from "@/lib/profile";
import {useStoredData} from "@/lib/useStoredData";
import { getCharacterEvolution, MAX_LEVEL } from "@/lib/characterEvolution";
import { completionIndex, hasCompleted, isDue } from "@/lib/questSystem";
import { useQuestSystem, type QuestReward } from "@/lib/useQuestSystem";
import styles from "./CompactDashboard.module.css";
import { attributeXP, safeHunterProgress } from "@/lib/hunterCore";
import rankStyles from "./RankLetter.module.css";

const ATTRIBUTES = [
  { key: "focus", label: "FOCUS", Icon: Focus, color: "#44d6ff" },
  { key: "discipline", label: "DISCIPLINE", Icon: Flame, color: "#ff6c92" },
  { key: "knowledge", label: "KNOWLEDGE", Icon: Brain, color: "#aa82fb" },
  { key: "energy", label: "ENERGY", Icon: HeartPulse, color: "#4ce5b5" },
  { key: "consistency", label: "CONSISTENCY", Icon: Repeat2, color: "#ffc766" },
] as const;

export default function DashboardPage() {
  const system = useQuestSystem();
  const { data, currentDate, ready, error } = system;
  const [notice, setNotice] = useState<QuestReward | null>(null);
  const profile=useStoredData(PROFILE_KEY,readProfile,null);
  const playerName=profile.data?.name||'HUNTER',avatar=profile.data?.avatar;
  const totals=useMemo(()=>attributeXP(data.completions),[data.completions]);
  const completed=useMemo(()=>completionIndex(data.completions),[data.completions]);
  const maxAttribute=Math.max(100,...Object.values(totals));
  const due = ready ? data.quests.filter(q => q.frequency === "daily" && isDue(q, currentDate)) : [];
  const cleared = due.filter(q => hasCompleted(q, completed, currentDate)).length;
  // Cap the displayed level at 100 without altering saved EXP or the legacy XP formula.
  const hunterProgress = safeHunterProgress(data.totalXP);
  const level = Math.min(MAX_LEVEL, hunterProgress.level);
  // LifeQuest Hunter Rank 008C3 â€” no changes to XP or level calculation.
  const hunterRank = rankForLevel(level);
  const hunterRankColor = { E: "#afc1d0", D: "#72ceff", C: "#44e8c9", B: "#aa88ff", A: "#ffd471", S: "#ff6ea7" }[hunterRank];
  const evolution = getCharacterEvolution(level);
  const characterAwakened = evolution.stage > 0;
  const hunterPortrait = evolution.image;
  const pendingCinematic=usePendingCinematic(level,ready&&!error&&!notice);
  const progress = hunterProgress.percent;
  const completion = due.length ? Math.round(cleared * 100 / due.length) : 0;

  async function completeQuest(id: string) {
    if (error || !ready || notice) return;
    const reward = await system.completeQuest(id);
    if (reward) setNotice(reward);
  }

  return <SystemShell title="STATUS WINDOW" subtitle="DISCIPLINE CREATES FREEDOM">
    {/* The rank letter is anchored to the upper-right of the window. */}
    <div className={rankStyles.rankWindow} style={{ "--hunter-rank-color": hunterRankColor } as CSSProperties} aria-label={`Hunter Rank ${hunterRank}`} title={`Hunter Rank ${hunterRank}`}>
      <span className={rankStyles.rankLetter}>{hunterRank}</span>
    </div>
    <LevelCinematicGate level={level} ready={ready && !error && !notice} />
    <HunterTransition level={level} portrait={hunterPortrait} ready={ready && !error && !notice && pendingCinematic===null} />
    {error && <div className={styles.error} role="alert">SYSTEM STORAGE ERROR: {error}. Aucune donnée ne sera écrasée.</div>}
    {!ready ? <div className={styles.loading}>SYSTEM LOADING...</div> : <div className={styles.dashboard}>
      <section className={styles.heroPanel} aria-label="PLAYER STATUS AND METRICS">
        <div className={`${styles.playerArea} ${characterAwakened ? styles.awakened : ""}`} style={{"--evolution-aura": evolution.aura} as CSSProperties}>
          <div className={styles.playerLabel}>[ PLAYER STATUS ]</div>
          <div className={styles.playerArtwork}>
            {avatar !== "female" ? <Image key={hunterPortrait} src={hunterPortrait} alt={`LifeQuest Hunter — ${evolution.title} — niveau ${level}`} fill priority sizes="(max-width: 900px) 100vw, 550px" className={styles.heroImage} /> : <div className={styles.femaleFallback}><UserRound size={82} strokeWidth={1} /><span>HUNTRESS</span></div>}
          </div>
          <div className={styles.playerIdentity}>
            <div className={styles.rank}>{evolution.title} · STAGE {String(evolution.stage).padStart(2,"0")}</div>
            <h2 title={playerName}>{playerName}</h2>
            <span>LEVEL {String(level).padStart(2, "0")}</span>
            <div className={styles.playerExp}><div style={{width:`${progress}%`}} /></div>
          </div>
        </div>
        <div className={styles.metrics} aria-label="SYSTEM METRICS">
          {[
            {label:"LEVEL", value:String(level).padStart(2,"0"),Icon:Crown, pct:progress},
            {label:"TOTAL EXP", value:data.totalXP.toLocaleString(),Icon:Zap,pct:progress},
            {label:"DAILY CLEARED",value:`${cleared} / ${due.length}`,Icon:ClipboardCheck,pct:completion},
            {label:"DAILY COMPLETION",value:`${completion}%`,Icon:Target,pct:completion},
          ].map(({label,value,Icon,pct}) => <div className={styles.metric} key={label}>
            <span>{label}</span><Icon aria-hidden="true" size={35} strokeWidth={1.5}/><strong>{value}</strong>
            <div className={styles.metricTrack}><div style={{width:`${pct}%`}} /></div>
          </div>)}
        </div>
      </section>
      <div style={{display:"flex",justifyContent:"flex-end",margin:"4px 0 10px"}}><Link href="/hunter-operations" style={{color:"#79dcff",border:"1px solid #217cae",padding:"9px 15px",background:"#082239",fontSize:12,letterSpacing:1.2,fontWeight:700}}>HUNTER OPERATIONS</Link></div>
      <div className={styles.lowerGrid}>
        <section className={styles.questPanel} aria-labelledby="daily-title">
          <header className={styles.sectionHeader}><h2 id="daily-title"><Target size={23}/> [ DAILY QUESTS ]</h2><span>{cleared} / {due.length} CLEARED</span></header>
          <div className={styles.questScroll}>
            {due.length === 0 ? <div className={styles.emptyQuests}>Aucune DAILY QUEST aujourd’hui. <Link href="/quests">Ouvrir QUEST LOG</Link></div> : due.map(q => {
              const checked = hasCompleted(q, completed, currentDate);
              return <button type="button" key={q.id} className={`${styles.questRow} ${checked ? styles.questDone : ""}`} disabled={checked || !!error || !!notice} onClick={()=>completeQuest(q.id)} aria-label={checked ? `${q.title}, terminée` : `Terminer ${q.title}`} aria-pressed={checked}>
                <span className={styles.checkBox} aria-hidden="true">{checked && <Check size={20} strokeWidth={3}/>}</span><span className={styles.questTitle}>{q.title}</span>
              </button>;
            })}
          </div>
        </section>
        <section className={styles.attributePanel} aria-labelledby="attributes-title">
          <header className={styles.sectionHeader}><h2 id="attributes-title"><Shield size={23} aria-hidden="true"/> [ PLAYER ATTRIBUTES ]</h2></header>
          <div className={styles.attributeSummary}>
            <p>XP cumulés par attribut, issus des validations enregistrées.</p>
            <p id="attribute-scale" className={styles.attributeScale}>Échelle commune : 0–{maxAttribute.toLocaleString('fr-FR')} XP</p>
          </div>
          <div className={styles.statsList}>{ATTRIBUTES.map(({key,label,Icon,color})=>{
            const value = totals[key];
            const formatted = value.toLocaleString('fr-FR');
            return <div className={styles.statRow} key={key}>
              <div className={styles.statName}><Icon size={21} aria-hidden="true" style={{color}}/><span>{label}</span></div>
              <div className={styles.statTrack} role="meter" aria-label={label+' : XP cumulés'} aria-valuemin={0} aria-valuemax={maxAttribute} aria-valuenow={value} aria-valuetext={formatted+' XP'} aria-describedby="attribute-scale"><div style={{width:Math.min(100,Math.round(value/maxAttribute*100))+'%',background:color,boxShadow:'0 0 12px '+color+'44'}} /></div>
              <strong className={styles.statValue}>{formatted} <span className={styles.statUnit}>XP</span></strong>
            </div>;
          })}</div>
          <p className={styles.disclaimer}>Les barres comparent les attributs ; elles ne représentent pas un score sur 100.</p>
        </section>
      </div>
      {notice && <Modal label="Récompense de quête" onClose={()=>setNotice(null)}><div className="reward-modal"><div className="eyebrow">[ SYSTEM NOTIFICATION ]</div><h2>{notice.levelAfter > notice.levelBefore ? "LEVEL UP!" : "QUEST COMPLETE"}</h2><p>{notice.title}</p><div className="reward-xp">+{notice.xp} EXP</div><button type="button" className="continue-btn" onClick={()=>setNotice(null)}>CONTINUE</button></div></Modal>}
    </div>}
  </SystemShell>;
}
