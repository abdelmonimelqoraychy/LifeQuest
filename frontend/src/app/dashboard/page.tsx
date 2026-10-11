"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Brain, Check, ClipboardCheck, Crown, Flame, Focus, HeartPulse, Repeat2, Shield, Target, UserRound, Zap } from "lucide-react";
import LevelCinematicGate from "@/components/cinematics/LevelCinematicGate";
import HunterTransition from "@/components/hunter/HunterTransition";
import SystemShell from "@/components/system/SystemShell";
import { getLevel, XP_PER_LEVEL } from "@/data/mockPlayer";
import { getCharacterEvolution, MAX_LEVEL } from "@/lib/characterEvolution";
import { hasCompleted, isDue } from "@/lib/questSystem";
import { useQuestSystem, type QuestReward } from "@/lib/useQuestSystem";
import styles from "./CompactDashboard.module.css";
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
  const [playerName, setPlayerName] = useState("HUNTER");
  const [avatar, setAvatar] = useState<"male" | "female" | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("lifequest-profile-v1");
      if (!raw) return;
      const profile: unknown = JSON.parse(raw);
      if (profile && typeof profile === "object") {
        const p = profile as { name?: unknown; avatar?: unknown };
        if (typeof p.name === "string" && p.name.trim()) setPlayerName(p.name.trim());
        if (p.avatar === "male" || p.avatar === "female") setAvatar(p.avatar);
      }
    } catch { /* Preserve default presentation if the profile is unreadable. */ }
  }, []);

  const due = ready ? data.quests.filter(q => q.frequency === "daily" && isDue(q, currentDate)) : [];
  const cleared = due.filter(q => hasCompleted(q, data.completions, currentDate)).length;
  // Cap the displayed level at 100 without altering saved EXP or the legacy XP formula.
  const level = Math.min(MAX_LEVEL, getLevel(data.totalXP));
  // LifeQuest Hunter Rank 008C3 â€” no changes to XP or level calculation.
  const hunterRank = level >= 50 ? "S" : level >= 40 ? "A" : level >= 30 ? "B" : level >= 20 ? "C" : level >= 10 ? "D" : "E";
  const hunterRankColor = { E: "#afc1d0", D: "#72ceff", C: "#44e8c9", B: "#aa88ff", A: "#ffd471", S: "#ff6ea7" }[hunterRank];
  const evolution = getCharacterEvolution(level);
  const characterAwakened = evolution.stage > 0;
  const hunterPortrait = evolution.image;
  const progress = Math.round((data.totalXP % XP_PER_LEVEL) / XP_PER_LEVEL * 100);
  const completion = due.length ? Math.round(cleared * 100 / due.length) : 0;
  const totalDone = data.quests.filter(q => !q.archived && hasCompleted(q, data.completions, currentDate));

  function completeQuest(id: string) {
    if (error || !ready || notice) return;
    const reward = system.completeQuest(id);
    if (reward) setNotice(reward);
  }

  return <SystemShell title="STATUS WINDOW" subtitle="DISCIPLINE CREATES FREEDOM">
    {/* The rank letter is anchored to the upper-right of the window. */}
    <div className={rankStyles.rankWindow} style={{ "--hunter-rank-color": hunterRankColor } as CSSProperties} aria-label={`Hunter Rank ${hunterRank}`} title={`Hunter Rank ${hunterRank}`}>
      <span className={rankStyles.rankLetter}>{hunterRank}</span>
    </div>
    <LevelCinematicGate level={level} ready={ready && !error && !notice} />
    <HunterTransition level={level} portrait={hunterPortrait} ready={ready && !error && !notice} />
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
            {due.length === 0 ? <div className={styles.emptyQuests}>Aucune DAILY QUEST aujourd'hui. <Link href="/quests">Ouvrir QUEST LOG</Link></div> : due.map(q => {
              const checked = hasCompleted(q, data.completions, currentDate);
              return <button type="button" key={q.id} className={`${styles.questRow} ${checked ? styles.questDone : ""}`} disabled={checked || !!error || !!notice} onClick={()=>completeQuest(q.id)} aria-label={checked ? `${q.title}, terminée` : `Terminer ${q.title}`} aria-pressed={checked}>
                <span className={styles.checkBox} aria-hidden="true">{checked && <Check size={20} strokeWidth={3}/>}</span><span className={styles.questTitle}>{q.title}</span>
              </button>;
            })}
          </div>
        </section>
        <section className={styles.attributePanel} aria-label="PLAYER ATTRIBUTES">
          <header className={styles.sectionHeader}><h2><Shield size={23}/> [ PLAYER ATTRIBUTES ]</h2></header>
          <div className={styles.statsList}>{ATTRIBUTES.map(({key,label,Icon,color})=>{
            const value = Math.min(100,30 + totalDone.filter(q=>q.attribute===key).length*18 + (key === "consistency" ? totalDone.length*7 : 0));
            return <div className={styles.statRow} key={key}>
              <div className={styles.statName}><Icon size={21} style={{color}}/><span>{label}</span></div>
              <div className={styles.statTrack}><div style={{width:`${value}%`,background:color,boxShadow:`0 0 12px ${color}44`}} /></div><strong>{value}</strong>
            </div>;
          })}</div>
          <p className={styles.disclaimer}>Attributs ludiques, non mesures scientifiques.</p>
        </section>
      </div>
      {notice && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Quest reward"><div className="reward-modal"><div className="eyebrow">[ SYSTEM NOTIFICATION ]</div><h2>{notice.levelAfter > notice.levelBefore ? "LEVEL UP!" : "QUEST COMPLETE"}</h2><p>{notice.title}</p><div className="reward-xp">+{notice.xp} EXP</div><button type="button" className="continue-btn" onClick={()=>setNotice(null)}>CONTINUE</button></div></div>}
    </div>}
  </SystemShell>;
}
