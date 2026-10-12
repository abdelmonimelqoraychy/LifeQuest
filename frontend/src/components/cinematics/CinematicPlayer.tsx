"use client";

import { useEffect, useRef, useState } from "react";
import Modal from '@/components/ui/Modal';
import styles from "./CinematicPlayer.module.css";

type Props = {
  src: string;
  fallbackSrc?: string;
  title: string;
  subtitle: string;
  onComplete: () => void;
  fullscreen?: boolean;
};

export default function CinematicPlayer({ src, fallbackSrc, title, subtitle, onComplete, fullscreen = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState(false);
  const [usingFallback,setUsingFallback]=useState(false);
  const [progress, setProgress] = useState(0);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    videoRef.current?.pause();
    onComplete();
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const attempt = video.play();
    if (attempt) void attempt.then(() => setPaused(false)).catch(() => setPaused(true));
  }, [src,usingFallback]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().then(() => setPaused(false)).catch(() => setPaused(true));
    } else {
      video.pause();
      setPaused(true);
    }
  };

  const content = (
    <section className={`${styles.cinema} ${fullscreen ? styles.fullscreen : ""}`} aria-label={title}>
      <div className={styles.backdrop} />
      {!error && <video
        ref={videoRef}
        className={styles.video}
        src={usingFallback&&fallbackSrc?fallbackSrc:src}
        playsInline
        autoPlay
        muted={muted}
        preload="metadata"
        onError={() => {if(fallbackSrc&&!usingFallback)setUsingFallback(true);else setError(true);}}
        onEnded={finish}
        onPause={() => setPaused(true)}
        onPlay={() => setPaused(false)}
        onTimeUpdate={(event) => {
          const v = event.currentTarget;
          setProgress(Number.isFinite(v.duration) && v.duration > 0 ? v.currentTime / v.duration * 100 : 0);
        }}
      />}
      <div className={styles.gradient} aria-hidden="true" />
      <div className={styles.top}><span>LIFEQUEST // CINEMATIC EVENT</span><span>THE SYSTEM</span></div>
      <div className={styles.content}>
        <span className={styles.eyebrow}>[ STORY PROTOCOL ]</span>
        <h1>{title}</h1>
        <p>{error ? `Vidéo absente ou illisible : ${src}. Tu peux continuer sans perdre ta progression.` : subtitle}</p>
      </div>
      <div className={styles.controls}>
        <div className={styles.track}><div style={{ width: `${progress}%` }} /></div>
        <div className={styles.actions}>
          {!error && <>
            <button type="button" onClick={togglePlayback}>{paused ? "▶ Lire" : "Ⅱ Pause"}</button>
            <button type="button" onClick={() => setMuted(value => !value)}>{muted ? "Activer le son" : "Couper le son"}</button>
          </>}
          <button type="button" className={styles.skip} onClick={finish}>{error ? "Continuer →" : "Passer la vidéo →"}</button>
        </div>
      </div>
    </section>
  );
  return fullscreen ? <Modal label={title} onClose={finish}>{content}</Modal> : content;
}
