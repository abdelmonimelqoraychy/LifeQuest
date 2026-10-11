"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CinematicPlayer from "@/components/cinematics/CinematicPlayer";

const PROFILE_KEY = "lifequest-profile-v1";
export default function ActivationPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PROFILE_KEY);
      if (!raw || JSON.parse(raw)?.onboardingCompleted !== true) {
        router.replace("/onboarding");
        return;
      }
      setAuthorized(true);
    } catch { router.replace("/onboarding"); }
  }, [router]);
  if (!authorized) return <main style={{ minHeight: "100vh", background: "#02060d" }} />;
  return <CinematicPlayer
    fullscreen
    src="/cinematics/player-activation.mp4"
    title="YOU ARE A PLAYER"
    subtitle="Le System t'a reconnu. Ton aventure commence maintenant."
    onComplete={() => router.replace("/dashboard")}
  />;
}
