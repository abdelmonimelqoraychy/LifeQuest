'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Compass, GraduationCap, LogOut, Menu, PanelLeftClose, PanelLeftOpen, PlusCircle, ScrollText, Shield, Zap } from 'lucide-react';
import styles from './SystemShell.module.css';
import { useHunterCloud } from '@/lib/hunter/cloud';

const routes = [
  { href: '/dashboard', name: 'STATUS WINDOW', icon: Compass }, { href: '/quests', name: 'QUEST LOG', icon: ScrollText },
  { href: '/quests/create', name: 'CREATE QUEST', icon: PlusCircle }, { href: '/arcs', name: 'STORY ARCS', icon: BookOpen },
  { href: '/hunter-lab', name: 'HUNTER LAB', icon: Zap }, { href: '/english', name: 'ENGLISH ACADEMY', icon: GraduationCap },
];
const dashboardRouteNames: Record<string, string> = {
  '/dashboard': 'Profil',
  '/quests': 'Quêtes',
  '/quests/create': 'Nouvelle quête',
  '/arcs': 'Arcs narratifs',
  '/hunter-lab': 'Laboratoire',
  '/english': 'English Academy',
};
export default function SystemShell({ title, subtitle, children, dashboardChrome = false }: { title: string; subtitle: string; children: ReactNode; dashboardChrome?: boolean }) {
  const pathname = usePathname(); const [collapsed, setCollapsed] = useState(false); const cloud = useHunterCloud();
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => { contentRef.current?.scrollTo(0, 0); window.scrollTo(0, 0); }, [pathname]);
  const concealSnapshot = cloud.loading || !!cloud.error;
  const shellClass = `${styles.shell}${dashboardChrome ? ` ${styles.dashboardChrome}` : ''}`;
  return <main className={shellClass}>
    <div className="ambient-orb ambient-one" aria-hidden="true"/><div className="ambient-orb ambient-two" aria-hidden="true"/><div className="sky-stars" aria-hidden="true"/>
    <div className={`${styles.layout} ${collapsed ? styles.collapsed : ''}`}>
      <aside className={styles.navigation} aria-label={dashboardChrome ? 'Navigation LifeQuest' : 'System navigation'}><div className={styles.logo}><Shield size={25}/><span>LIFEQUEST</span><button type="button" className={styles.logoutButton} onClick={() => void cloud.logout()} aria-label="Se déconnecter" title="Se déconnecter"><LogOut size={16}/></button><button type="button" className={styles.collapseButton} onClick={() => setCollapsed(v => !v)} aria-label={collapsed ? 'Afficher le menu' : 'Masquer le menu'} aria-controls={dashboardChrome ? 'lifequest-primary-navigation' : undefined} aria-expanded={dashboardChrome ? !collapsed : undefined}>{collapsed ? <PanelLeftOpen size={19}/> : <PanelLeftClose size={19}/>}</button></div>
        <nav id={dashboardChrome ? 'lifequest-primary-navigation' : undefined} className={styles.links} aria-label={dashboardChrome ? 'Sections principales' : undefined}>{routes.map(route => { const label = dashboardChrome ? dashboardRouteNames[route.href] : route.name; const active = pathname === route.href || (route.href === '/english' && pathname.startsWith('/english/')); return <Link key={route.href} href={route.href} className={`${styles.link} ${active ? styles.active : ''}`} aria-label={label} title={label} aria-current={active ? 'page' : undefined}><route.icon size={19}/><span>{label}</span></Link>; })}</nav>
        <div className={styles.online}><Zap size={15}/> {dashboardChrome ? 'SYSTÈME EN LIGNE' : 'SYSTEM ONLINE'}</div>
      </aside>
      <div ref={contentRef} className={styles.content}><button type="button" className={styles.mobileToggle} onClick={() => setCollapsed(v => !v)} aria-label={collapsed ? 'Afficher le menu' : 'Masquer le menu'}><Menu size={18}/> {collapsed ? 'MENU' : 'MASQUER MENU'}</button>
        <header className={styles.header}><span className={styles.kicker}>{dashboardChrome ? '[ LIFEQUEST // SYSTÈME HUNTER ]' : '[ LIFEQUEST // SYSTEM INTERFACE ]'}</span>{dashboardChrome ? <p className={styles.shellTitle}>{title}</p> : <h1>{title}</h1>}<p>{subtitle}</p></header>
        {cloud.error && <p role="alert">{cloud.error} <button type="button" onClick={() => void (cloud.hasUncertainCommand ? cloud.retryCommand() : cloud.refresh())}>Réessayer</button></p>}
        {cloud.notice && <p className={styles.notice} role="status">{cloud.notice}</p>}
        {cloud.loading && <p role="status">Actualisation et vérification de la session cloud…</p>}
        {cloud.snapshot.state === 'ready' && <div aria-hidden={concealSnapshot} style={concealSnapshot ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}>{children}</div>}
      </div>
    </div>
  </main>;
}
