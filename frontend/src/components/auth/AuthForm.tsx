'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import AuthShell from './AuthShell';
import styles from './auth.module.css';
type Mode = 'register' | 'login' | 'forgot-password' | 'update-password';
const copy = {
  register: ['Créer mon compte', 'Une adresse confirmée protège l’accès à votre espace Hunter.', 'Créer mon compte'],
  login: ['Retrouver mon compte', 'Connectez-vous pour accéder à votre espace Hunter.', 'Se connecter'],
  'forgot-password': ['Retrouver mon accès', 'Recevez un lien pour choisir un nouveau mot de passe.', 'Envoyer le lien'],
  'update-password': ['Nouveau mot de passe', 'Choisissez un mot de passe unique, différent de l’ancien.', 'Enregistrer le mot de passe'],
};
const errors: Record<string, string> = {
  LOGIN_REFUSED: 'Connexion refusée. Vérifiez vos informations et la confirmation de votre adresse.',
  EMAIL_INVALID: 'Saisissez une adresse e-mail valide.', PASSWORD_INVALID: 'Utilisez au moins 12 caractères et deux mots de passe identiques.',
  RATE_LIMITED: 'Trop de demandes. Patientez avant de réessayer.', RECOVERY_REQUIRED: 'Ce lien n’est plus valide. Demandez un nouveau lien.',
  PASSWORD_UPDATE_REFUSED: 'Ce mot de passe a été refusé. Choisissez-en un autre.',
};
export default function AuthForm({ mode, notice }: { mode: Mode; notice?: string }) {
  const [pending, setPending] = useState(false); const busy = useRef(false);
  const [error, setError] = useState(''); const [sent, setSent] = useState(false);
  const message = useRef<HTMLDivElement>(null);
  useEffect(() => { if (mode === 'update-password') { const channel = new BroadcastChannel('lifequest-auth'); channel.postMessage('changed'); channel.close(); } }, [mode]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current) return;
    const form = new FormData(event.currentTarget); const body = Object.fromEntries(form.entries());
    if ((mode === 'register' || mode === 'update-password') && body.password !== body.confirmPassword) { setError(errors.PASSWORD_INVALID); setTimeout(() => message.current?.focus(), 0); return; }
    busy.current = true; setPending(true); setError('');
    try {
      const response = await fetch('/api/auth/' + mode, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) { setError(errors[result.code] || 'Le service est indisponible. Réessayez dans un instant.'); return; }
      if (mode === 'login' || mode === 'update-password') {
        const channel = new BroadcastChannel('lifequest-auth'); channel.postMessage('changed'); channel.close();
        window.location.replace(mode === 'login' ? '/auth/loading' : '/login?notice=password-updated');
      } else setSent(true);
    } catch { setError('Connexion interrompue. Vérifiez votre réseau puis réessayez.'); }
    finally { busy.current = false; setPending(false); setTimeout(() => message.current?.focus(), 0); }
  }
  return <AuthShell><h1>{copy[mode][0]}</h1><p>{copy[mode][1]}</p>
    {notice && <div className={styles.message} role="status">{notice === 'password-updated' ? 'Mot de passe enregistré. Connectez-vous à nouveau.' : notice === 'auth-unavailable' ? 'Le service est indisponible. Réessayez ou demandez un nouveau lien.' : 'Lien invalide, expiré ou déjà utilisé. Demandez un nouveau lien.'}</div>}
    {(error || sent) && <div ref={message} tabIndex={-1} role={error ? 'alert' : 'status'} className={`${styles.message} ${error ? styles.error : ''}`}>{error || 'Si votre adresse permet cette demande, un e-mail vous sera envoyé. Consultez votre boîte de réception.'}</div>}
    {!sent && <form className={styles.form} onSubmit={submit} aria-busy={pending}>
      {mode !== 'update-password' && <label className={styles.field} htmlFor="email">Adresse e-mail<input id="email" name="email" type="email" autoComplete="email" required maxLength={254} disabled={pending} /></label>}
      {mode !== 'forgot-password' && <label className={styles.field} htmlFor="password">Mot de passe<input id="password" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? undefined : 12} maxLength={128} disabled={pending} aria-describedby={mode === 'login' ? undefined : 'password-help'} />{mode !== 'login' && <small id="password-help">12 caractères minimum.</small>}</label>}
      {(mode === 'register' || mode === 'update-password') && <label className={styles.field} htmlFor="confirmPassword">Confirmer le mot de passe<input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={pending} /></label>}
      <button className={styles.button} disabled={pending}>{pending ? 'En cours…' : copy[mode][2]}</button>
    </form>}
    <nav className={styles.links} aria-label="Accès au compte">{mode !== 'login' && <Link href="/login" prefetch={false}>Se connecter</Link>}{mode === 'login' && <Link href="/register" prefetch={false}>Créer un compte</Link>}{mode !== 'forgot-password' && <Link href="/forgot-password" prefetch={false}>Mot de passe oublié</Link>}{sent && mode === 'register' && <button className={`${styles.button} ${styles.secondary}`} onClick={() => setSent(false)}>Renvoyer une demande</button>}</nav>
  </AuthShell>;
}
