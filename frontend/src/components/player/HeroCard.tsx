"use client";
import { motion } from "motion/react";
import {readProfile,PROFILE_KEY} from '@/lib/profile';
import {useStoredData} from '@/lib/useStoredData';
import {rankForLevel} from '@/lib/hunterMissions';
import { UserRound } from "lucide-react";
import Image from "next/image";
import SystemCard from "@/components/ui/SystemCard";
import XPBar from "@/components/player/XPBar";
import { getLevel, player } from "@/data/mockPlayer";
export default function HeroCard({ totalXP }: { totalXP: number }) {
  const level = getLevel(totalXP);
  const {data:profile}=useStoredData(PROFILE_KEY,readProfile,null);
  const female = profile?.avatar === "female";
  return <SystemCard label="PLAYER STATUS" className="hero-card">
    <div className={`hero-portrait ${female ? "hero-portrait-female" : ""}`} aria-label="Portrait du héros LifeQuest">
      <div className="hero-halo" aria-hidden="true"/>
      <div className="hero-rune hero-rune-a" aria-hidden="true">✦</div>
      <div className="hero-rune hero-rune-b" aria-hidden="true">✧</div>
      <motion.div className="hero-character" animate={{ y:[0,-6,0] }} transition={{ duration:5,repeat:Infinity,ease:"easeInOut" }}>
        {female ? <div className="hero-female-placeholder" aria-label="Silhouette provisoire du personnage féminin"><UserRound size={105} strokeWidth={1}/><span>ASTRAL HUNTER</span></div> : <Image src="/hero-awakening.svg" alt="Héros anime original LifeQuest en manteau noir avec aura bleue" fill priority sizes="(max-width: 550px) 100vw, 260px" style={{objectFit:"contain",objectPosition:"center bottom"}} />}
      </motion.div>
      <div className="portrait-scan" aria-hidden="true"/>
      <span className="portrait-bottom">THE FIRST AWAKENING</span>
    </div>
    <div className="hero-details">
      <div className="eyebrow">PLAYER ID // 001 <span className="online-dot"/></div>
      <motion.h2 key={level} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}>{profile?.name || player.name}</motion.h2>
      <p className="hero-subtitle">{female ? "ASTRAL HUNTER" : player.title}</p>
      <div className="hero-badges"><span className="rank-badge">RANK {rankForLevel(level)}</span><span className="level-badge">LVL {String(level).padStart(2,"0")}</span></div>
      <XPBar totalXP={totalXP}/>
      <p className="hero-motto">“EVOLVE THROUGH ACTION.”</p>
    </div>
  </SystemCard>;
}
