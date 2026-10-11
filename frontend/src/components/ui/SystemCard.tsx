import type { ReactNode } from "react";
export default function SystemCard({ children, className = "", label }: { children: ReactNode; className?: string; label?: string }) {
  return <section className={`system-panel ${className}`}>
    <span className="panel-corner panel-corner-tl" aria-hidden="true"/><span className="panel-corner panel-corner-br" aria-hidden="true"/>
    {label && <div className="system-label">[ {label} ]</div>}{children}
  </section>;
}
