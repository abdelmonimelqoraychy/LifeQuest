"use client";
import { Check, CircleDot, Zap } from "lucide-react";
import { motion } from "motion/react";
import SystemCard from "@/components/ui/SystemCard";
import type { Quest } from "@/types";
export default function QuestList({quests,onComplete}:{quests:Quest[];onComplete:(id:string)=>void}) {
  return <SystemCard label="DAILY QUEST BOARD" className="quests-card">
    <div className="section-heading"><h2>TODAY&apos;S MISSIONS</h2><span>{quests.filter(q=>q.completed).length} / {quests.length} CLEARED</span></div>
    <div className="quest-list">{quests.map(q=><motion.button key={q.id} type="button" className={`quest-item ${q.completed?"quest-done":""}`} whileHover={q.completed?{}:{x:4}} whileTap={q.completed?{}:{scale:.99}} onClick={()=>onComplete(q.id)} disabled={q.completed}>
      <span className="quest-check">{q.completed?<Check size={20}/>:<CircleDot size={20}/>}</span><span className="quest-info"><strong>{q.title}</strong><small>{q.description}</small></span>
      <span className="quest-reward"><small>{q.difficulty}</small><b><Zap size={12}/> {q.xp} XP</b></span>
    </motion.button>)}</div>
    <p className="hint">Démonstration : valide les missions pour gagner des XP.</p>
  </SystemCard>;
}
