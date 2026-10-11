"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Compass, Menu, PanelLeftClose, PanelLeftOpen, PlusCircle, ScrollText, Shield, Zap } from "lucide-react";
import styles from "./SystemShell.module.css";
const routes = [
  { href: "/dashboard", name: "STATUS WINDOW", icon: Compass },
  { href: "/quests", name: "QUEST LOG", icon: ScrollText },
  { href: "/quests/create", name: "CREATE QUEST", icon: PlusCircle },
  { href: "/arcs", name: "STORY ARCS", icon: BookOpen },
  { href: "/hunter-lab", name: "HUNTER LAB", icon: Zap },
];
export default function SystemShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  return <main className={styles.shell}>
    <div className="ambient-orb ambient-one" aria-hidden="true"/><div className="ambient-orb ambient-two" aria-hidden="true"/><div className="sky-stars" aria-hidden="true"/>
    <div className={`${styles.layout} ${collapsed ? styles.collapsed : ""}`}>
      <aside className={styles.navigation} aria-label="System navigation">
        <div className={styles.logo}><Shield size={25}/><span>LIFEQUEST</span><button type="button" className={styles.collapseButton} onClick={() => setCollapsed(v => !v)} aria-label={collapsed ? "Afficher le menu" : "Masquer le menu"} aria-expanded={!collapsed} title={collapsed ? "Afficher le menu" : "Masquer le menu"}>{collapsed ? <PanelLeftOpen size={19}/> : <PanelLeftClose size={19}/>}</button></div>
        <nav className={styles.links}>{routes.map(route => <Link key={route.href} href={route.href} className={`${styles.link} ${pathname === route.href ? styles.active : ""}`} aria-label={route.name} title={route.name} aria-current={pathname === route.href ? "page" : undefined}><route.icon size={19}/><span>{route.name}</span></Link>)}</nav>
        <div className={styles.online}><Zap size={15}/> SYSTEM ONLINE</div>
      </aside>
      <div className={styles.content}>
        <button type="button" className={styles.mobileToggle} onClick={() => setCollapsed(v => !v)} aria-label={collapsed ? "Afficher le menu" : "Masquer le menu"}><Menu size={18}/> {collapsed ? "MENU" : "MASQUER MENU"}</button>
        <header className={styles.header}><span className={styles.kicker}>[ LIFEQUEST // SYSTEM INTERFACE ]</span><h1>{title}</h1><p>{subtitle}</p></header>
        {children}
      </div>
    </div>
  </main>;
}
