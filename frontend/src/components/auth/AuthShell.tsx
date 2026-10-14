import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './auth.module.css';
export default function AuthShell({ children }: { children: ReactNode }) {
  return <main className={styles.shell}><header className={styles.header}><Link href="/" prefetch={false} className={styles.brand}>LIFE<span>QUEST</span></Link><span>Votre compte Hunter</span></header><section className={styles.content}>{children}</section><footer className={styles.footer}>Avancez à votre rythme. Votre histoire vous appartient.</footer></main>;
}
