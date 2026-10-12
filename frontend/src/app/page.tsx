import Link from 'next/link';
import AuthShell from '@/components/auth/AuthShell';
import styles from '@/components/auth/auth.module.css';
export default function Page() { return <AuthShell><h1>Votre histoire commence ici</h1><p>Retrouvez votre compte Hunter ou créez votre accès à LifeQuest.</p><nav className={styles.links} aria-label="Compte Hunter"><Link className={styles.button} href="/login" prefetch={false}>Se connecter</Link><Link href="/register" prefetch={false}>Créer un compte</Link></nav></AuthShell>; }
