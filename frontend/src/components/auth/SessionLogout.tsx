'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './auth.module.css';

export default function SessionLogout() {
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const current = new BroadcastChannel('lifequest-auth');
    channel.current = current;
    current.onmessage = event => {
      if (event.data === 'locking') {
        busyRef.current = true;
        document.cookie = 'lifequest-access-locked=1; Path=/; SameSite=Strict' + (location.protocol === 'https:' ? '; Secure' : '');
        location.replace('/login');
      } else if (event.data === 'logout-failed') {
        busyRef.current = false;
        setError(true);
        setBusy(false);
      }
    };
    return () => { current.close(); channel.current = null; };
  }, []);

  async function logout() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(false);
    channel.current?.postMessage('locking');
    document.cookie = 'lifequest-access-locked=1; Path=/; SameSite=Strict' + (location.protocol === 'https:' ? '; Secure' : '');
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('LOGOUT_FAILED');
      channel.current?.postMessage('changed');
      location.replace('/login');
    } catch {
      busyRef.current = false;
      setError(true);
      setBusy(false);
      channel.current?.postMessage('logout-failed');
    }
  }

  return <div className={styles.links}>
    <button className={styles.button} type="button" onClick={() => void logout()} disabled={busy}>
      {busy ? 'Déconnexion…' : 'Se déconnecter'}
    </button>
    {error && <p role="alert">La déconnexion n’a pas pu être confirmée. L’espace reste masqué. Réessayez.</p>}
  </div>;
}
