"use client";
import { motion } from "motion/react";
import { Brain, Flame, Focus, HeartPulse, Repeat2 } from "lucide-react";
import SystemCard from "@/components/ui/SystemCard";
import type { Quest } from "@/types";
const list = [
  {key:"focus",label:"FOCUS",icon:Focus,color:"#42d4ff"},
  {key:"discipline",label:"DISCIPLINE",icon:Flame,color:"#ff788b"},
  {key:"knowledge",label:"KNOWLEDGE",icon:Brain,color:"#aa92ff"},
  {key:"energy",label:"ENERGY",icon:HeartPulse,color:"#59e7b1"},
  {key:"consistency",label:"CONSISTENCY",icon:Repeat2,color:"#f7cb76"},
] as const;
export default function PlayerStats({quests}:{quests:Quest[]}) {
  const done = quests.filter(q=>q.completed);
  return <SystemCard label="PLAYER ATTRIBUTES" className="stats-card"><div className="stats-list">
    {list.map(s=>{const value = Math.min(100,30+done.filter(q=>q.attribute===s.key).length*18+(s.key==="consistency"?done.length*7:0)); return <div key={s.key} className="stat-row">
      <div className="stat-top"><span className="stat-name"><s.icon size={17} color={s.color}/>{s.label}</span><b>{value}</b></div>
      <div className="stat-track"><motion.div initial={false} animate={{width:`${value}%`}} transition={{duration:.65}} style={{background:s.color,boxShadow:`0 0 14px ${s.color}75`}}/></div>
    </div>})}
  </div><p className="hint">Attributs ludiques, non mesures scientifiques.</p></SystemCard>;
}
