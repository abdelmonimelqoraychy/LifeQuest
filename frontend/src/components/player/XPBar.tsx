"use client";
import { motion } from "motion/react";
import { XP_PER_LEVEL } from "@/data/mockPlayer";
export default function XPBar({ totalXP }: { totalXP: number }) {
  const current = totalXP % XP_PER_LEVEL;
  return <div className="xp-wrapper" aria-label={`${current} XP sur ${XP_PER_LEVEL} pour le niveau suivant`}>
    <div className="xp-caption"><span>EXPERIENCE POINTS</span><span>{current} / {XP_PER_LEVEL} XP</span></div>
    <div className="xp-track"><motion.div className="xp-progress" initial={false} animate={{ width: `${current / XP_PER_LEVEL * 100}%` }} transition={{ type: "spring", stiffness: 90, damping: 20 }}/></div>
  </div>;
}
