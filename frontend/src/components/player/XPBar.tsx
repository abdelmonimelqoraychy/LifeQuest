"use client";
import { motion } from "motion/react";
import {getHunterProgress} from "@/lib/hunterCore";
export default function XPBar({ totalXP }: { totalXP: number }) {
  const {current,required:XP_PER_LEVEL,percent}=getHunterProgress(totalXP);
  return <div className="xp-wrapper" aria-label={`${current} XP sur ${XP_PER_LEVEL} pour le niveau suivant`}>
    <div className="xp-caption"><span>EXPERIENCE POINTS</span><span>{current} / {XP_PER_LEVEL} XP</span></div>
    <div className="xp-track"><motion.div className="xp-progress" initial={false} animate={{ width: `${percent}%` }} transition={{ type: "spring", stiffness: 90, damping: 20 }}/></div>
  </div>;
}
