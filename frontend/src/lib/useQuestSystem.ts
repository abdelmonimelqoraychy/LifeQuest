"use client";
import { useCallback, useEffect, useState } from "react";
import type { Attribute } from "@/types";
import { emptySystem, hasCompleted, isDue, loadState, localDate, newId, periodId, saveState, type Frequency, type QuestSystemState } from "@/lib/questSystem";

export type QuestInput = {
  title: string; description: string; frequency: Frequency; attribute: Attribute;
  difficulty: "EASY" | "NORMAL" | "HARD"; xp: number; arcId: string; targetDate: string;
};
export type QuestReward = { title: string; xp: number; levelBefore: number; levelAfter: number };
export function useQuestSystem() {
  const [data, setData] = useState<QuestSystemState>(emptySystem);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [today, setToday] = useState("");
  useEffect(() => {
    try { setData(loadState()); } catch (e) { setError(e instanceof Error ? e.message : "Impossible de charger la sauvegarde"); }
    setToday(localDate(new Date()));
    setReady(true);
    const refresh = () => setToday(localDate(new Date()));
    const onStorage = (event: StorageEvent) => {
      if (event.key === "lifequest-quest-system-v1") {
        try { setData(loadState()); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Sauvegarde illisible"); }
      }
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("storage", onStorage); };
  }, []);
  const commit = useCallback((update: (prev: QuestSystemState) => QuestSystemState) => {
    if (!ready || error) return false;
    try {
      // Reload latest persisted state to avoid stale writes after a page navigation.
      const previous = loadState();
      const next = update(previous);
      saveState(next);
      setData(next);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Enregistrement impossible"); return false; }
  }, [ready, error]);
  const createQuest = (draft: QuestInput) => commit(prev => ({ ...prev, quests: [...prev.quests, {
    id: newId(), createdAt: new Date().toISOString(), title: draft.title.trim(), description: draft.description.trim(),
    frequency: draft.frequency, attribute: draft.attribute, difficulty: draft.difficulty, xp: draft.xp,
    arcId: draft.arcId || undefined, targetDate: draft.frequency === "once" ? draft.targetDate || undefined : undefined,
  }] }));
  const updateQuest = (id: string, draft: QuestInput) => commit(prev => ({ ...prev, quests: prev.quests.map(q => q.id === id ? {
    ...q, title: draft.title.trim(), description: draft.description.trim(), frequency: draft.frequency,
    attribute: draft.attribute, difficulty: draft.difficulty, xp: draft.xp, arcId: draft.arcId || undefined,
    targetDate: draft.frequency === "once" ? draft.targetDate || undefined : undefined,
  } : q) }));
  const archiveQuest = (id: string) => commit(prev => ({ ...prev, quests: prev.quests.map(q => q.id === id ? { ...q, archived: true } : q) }));
  const completeQuest = (id: string): QuestReward | null => {
    if (!ready || error) return null;
    let reward: QuestReward | null = null;
    const ok = commit(prev => {
      const now = new Date();
      const q = prev.quests.find(item => item.id === id);
      if (!q || !isDue(q, now) || hasCompleted(q, prev.completions, now)) return prev;
      const period = periodId(q.frequency, now);
      reward = { title: q.title, xp: q.xp, levelBefore: Math.floor(prev.totalXP / 300) + 1, levelAfter: Math.floor((prev.totalXP + q.xp) / 300) + 1 };
      return { ...prev, totalXP: prev.totalXP + q.xp, completions: [...prev.completions, {
        id: newId(), questId: id, period, completedAt: now.toISOString(), xpAwarded: q.xp, attribute: q.attribute,
      }] };
    });
    return ok ? reward : null;
  };
  const addArc = (title: string, description: string, targetDate: string) => {
    const now = new Date();
    const limit = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate());
    if (!title.trim() || targetDate < localDate(now) || targetDate > localDate(limit)) return false;
    return commit(prev => ({ ...prev, arcs: [...prev.arcs, { id: newId(), title: title.trim(), description: description.trim(), targetDate, createdAt: now.toISOString() }] }));
  };
  const deleteArc = (id: string) => commit(prev => ({ ...prev, arcs: prev.arcs.filter(a => a.id !== id), quests: prev.quests.map(q => q.arcId === id ? { ...q, arcId: undefined } : q) }));
  const currentDate = today ? new Date(`${today}T12:00:00`) : new Date(2000, 0, 1);
  return { data, ready, error, today, currentDate, createQuest, updateQuest, archiveQuest, completeQuest, addArc, deleteArc };
}
