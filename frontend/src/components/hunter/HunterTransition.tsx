"use client";
import { useEffect, useState } from "react";
import { rankForLevel, hunterEvent, loadExtra, saveExtra } from "@/lib/hunterMissions";
import styles from "./HunterTransition.module.css";
const MILESTONE_KEY = "lifequest-hunter-transition-v1";
type Transition = { title: string; message: string; type: "rank" | "evolution" };
export default function HunterTransition({ level, ready, portrait }: { level: number; ready: boolean; portrait: string }) {
  const [pending, setPending] = useState<Transition[]>([]);
    useEffect(() => {
    if (!ready) return;
    try {
      const raw = localStorage.getItem(MILESTONE_KEY);
      const previous = raw === null ? level : Number(raw);
      // First launch establishes a baseline instead of replaying old milestones.
      if (!Number.isFinite(previous) || previous < 1) { localStorage.setItem(MILESTONE_KEY, String(level)); return; }
      if (level > previous) {
        const items: Transition[] = [];
        const recorded = [] as ReturnType<typeof hunterEvent>[];
        for (let n = previous + 1; n <= level; n++) {
          if (rankForLevel(n) !== rankForLevel(n - 1)) {
            items.push({ title: "RANK UP!", message: `HUNTER RANK ${rankForLevel(n)} UNLOCKED`, type: "rank" });
            recorded.push(hunterEvent("rank", `Rank ${rankForLevel(n)}`, `Level ${n}`));
          } else if (n % 5 === 0) {
            items.push({ title: "HUNTER EVOLUTION", message: `NEW FORM UNLOCKED · LEVEL ${n}`, type: "evolution" });
            recorded.push(hunterEvent("evolution", `Level ${n} evolution`));
          }
        }
        if (recorded.length) {
          try { const extra = loadExtra(); saveExtra({ ...extra, events: [...extra.events, ...recorded] }); } catch { /* Never block the dashboard for optional records. */ }
        }
        setPending(items);
      }
      localStorage.setItem(MILESTONE_KEY, String(level));
    } catch { /* Storage blocked: keep dashboard usable. */ }
  }, [ready, level]);
  const active = pending[0];
  if (!active) return null;
  return <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={active.title}>
    <div className={styles.scene}>
      <span className={styles.eyebrow}>[ LIFEQUEST // SYSTEM NOTIFICATION ]</span>
      <div className={styles.crest}>{active.type === "rank" ? rankForLevel(level) : <img src={portrait} alt="Hunter evolution" />}</div>
      <h2>{active.title}</h2><p>{active.message}</p>
      <button type="button" onClick={() => setPending(p => p.slice(1))}>CONTINUE</button>
    </div>
  </div>;
}
