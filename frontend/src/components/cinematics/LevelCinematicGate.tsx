"use client";
import { useEffect, useRef, useState } from "react";
import CinematicPlayer from "./CinematicPlayer";

type Milestone = 5 | 10 | 20;
const milestones: { level: Milestone; src: string; title: string; subtitle: string }[] = [
  { level: 5, src: "/cinematics/level-05.mp4", title: "I'VE GOTTA GET STRONGER", subtitle: "LEVEL 05 — Le chemin vers la puissance commence." },
  { level: 10, src: "/cinematics/level-10.mp4", title: "I HAVEN'T LOST YET", subtitle: "LEVEL 10 — Tu n'as pas abandonné." },
  { level: 20, src: "/cinematics/level-20.mp4", title: "POWER UNLEASHED", subtitle: "LEVEL 20 — Une nouvelle évolution." },
];

function playerKey() {
  try {
    const raw = window.localStorage.getItem("lifequest-profile-v1");
    const profile = raw ? JSON.parse(raw) as { createdAt?: string; name?: string } : {};
    return encodeURIComponent(profile.createdAt || profile.name || "local-player");
  } catch { return "local-player"; }
}

export default function LevelCinematicGate({ level, ready }: { level: number; ready: boolean }) {
  const [active, setActive] = useState<Milestone | null>(null);
  const sessionSeen = useRef<Set<Milestone>>(new Set());
  useEffect(() => {
    if (!ready || active !== null || !Number.isFinite(level)) return;
    const prefix = `lifequest-cinematic-seen-v1:${playerKey()}:`;
    const next = milestones.find(item => level >= item.level && !sessionSeen.current.has(item.level) && window.localStorage.getItem(prefix + item.level) !== "1");
    if (next) setActive(next.level);
  }, [level, ready, active]);

  if (active === null) return null;
  const item = milestones.find(entry => entry.level === active);
  if (!item) return null;
  return <CinematicPlayer
    key={active}
    fullscreen
    src={item.src}
    title={item.title}
    subtitle={item.subtitle}
    onComplete={() => {
      sessionSeen.current.add(active);
      try { window.localStorage.setItem(`lifequest-cinematic-seen-v1:${playerKey()}:${active}`, "1"); }
      catch { /* Local storage unavailable: still allow continuation */ }
      setActive(null);
    }}
  />;
}
