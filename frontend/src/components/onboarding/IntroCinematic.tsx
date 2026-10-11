"use client";
import CinematicPlayer from "../cinematics/CinematicPlayer";

/** First visit -> sacrifice -> existing registration form (step 1). */
export default function IntroCinematic({ onComplete }: { onComplete: () => void }) {
  return (
    <CinematicPlayer
      src="/cinematics/intro-sacrifice.mp4"
      title="THE AWAKENING"
      subtitle="Chaque histoire commence par un choix. Quelle sera la tienne ?"
      onComplete={onComplete}
    />
  );
}
