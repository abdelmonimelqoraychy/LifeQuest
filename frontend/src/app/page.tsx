"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Entry() {
  const router = useRouter();
  useEffect(() => {
    try {
      const profile = JSON.parse(localStorage.getItem("lifequest-profile-v1") || "null");
      // Existing V2 users keep their dashboard and XP without a forced onboarding.
      const legacy = localStorage.getItem("lifequest-v2-demo");
      router.replace(profile?.onboardingCompleted || legacy ? "/dashboard" : "/onboarding");
    } catch {
      router.replace("/onboarding");
    }
  }, [router]);
  return <main className="ob-page ob-center"><p>INITIALIZING LIFEQUEST SYSTEM…</p></main>;
}
