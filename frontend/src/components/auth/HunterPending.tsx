'use client';
import { useEffect, useRef, useState } from 'react';
import AuthShell from './AuthShell';
import styles from './auth.module.css';
export default function HunterPending({ actor, initiallyLocked = false }: { actor: string; initiallyLocked?: boolean }) {
  const [state, setState] = useState<'checking' | 'ready' | 'locked' | 'error' | 'logout_error'>(initiallyLocked ? 'locked' : 'checking');
  const epoch = useRef(0); const locked = useRef(initiallyLocked); const busy = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    let alive = true; const controller = new AbortController();
    async function revalidate() {
      if (locked.current) return;
      const current = ++epoch.current; setState('checking');
      try {
        const response = await fetch('/api/auth/bootstrap', { cache: 'no-store', signal: controller.signal });
        if (!alive || current !== epoch.current || locked.current) return;
        if (response.status === 401) { window.location.replace('/login'); return; }
        if (!response.ok) { setState('error'); return; }
        const data = await response.json();
        if (!alive || current !== epoch.current || locked.current) return;
        if (data.actor !== actor) { window.location.replace('/auth/loading'); return; }
        setState(data.state === 'cloud_not_connected' ? 'ready' : 'error');
      } catch { if (alive && current === epoch.current && !locked.current) setState('error'); }
    }
    const c = new BroadcastChannel('lifequest-auth'); channel.current = c;
    c.onmessage = event => {
      ++epoch.current; setState('locked');
      if (event.data === 'locking') locked.current = true;
      if (event.data === 'logout-failed') { locked.current = true; setState('logout_error'); }
      if (event.data === 'changed') { locked.current = false; void revalidate(); }
    };
    const hide = () => { ++epoch.current; setState('checking'); };
    const visible = () => { if (document.visibilityState === 'hidden') hide(); else void revalidate(); };
    const focus = () => { void revalidate(); };
    document.addEventListener('visibilitychange', visible); window.addEventListener('pagehide', hide); window.addEventListener('pageshow', focus); window.addEventListener('focus', focus);
    const timer = setInterval(() => void revalidate(), 30_000);
    if (!initiallyLocked) c.postMessage('changed'); void revalidate();
    return () => { alive = false; controller.abort(); clearInterval(timer); c.close(); document.removeEventListener('visibilitychange', visible); window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', focus); window.removeEventListener('focus', focus); };
  }, [actor, initiallyLocked]);
  async function logout() {
    if (busy.current) return; busy.current = true; locked.current = true; ++epoch.current; setState('locked'); channel.current?.postMessage('locking');
    document.cookie = 'lifequest-access-locked=1; Path=/; SameSite=Strict' + (location.protocol === 'https:' ? '; Secure' : '');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store' });
      if (!response.ok) throw new Error('LOGOUT_FAILED');
      channel.current?.postMessage('changed'); window.location.replace('/login');
    } catch { setState('logout_error'); channel.current?.postMessage('logout-failed'); busy.current = false; }
  }
  return <AuthShell>{state === 'ready' ? <><h1>Progression Hunter en préparation</h1><p>Votre connexion est établie. Votre progression Hunter sera disponible lorsque sa sauvegarde cloud sera connectée.</p></> : <><h1>{state === 'error' || state === 'logout_error' ? 'Accès momentanément indisponible' : 'Vérification de votre accès'}</h1><p role="status">{state === 'logout_error' ? 'La déconnexion n’a pas pu être confirmée. Votre espace reste masqué. Réessayez la déconnexion.' : state === 'error' ? 'Votre espace reste masqué. Réessayez dans un instant.' : 'Patientez pendant la vérification de votre session.'}</p></>}<button className={styles.button} onClick={logout}>Se déconnecter</button>{state === 'error' && <div className={styles.links}><button className={`${styles.button} ${styles.secondary}`} onClick={() => window.location.reload()}>Réessayer</button></div>}</AuthShell>;
}
