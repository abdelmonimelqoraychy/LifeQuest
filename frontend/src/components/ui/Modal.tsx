'use client';
import { useEffect, useRef, type ReactNode } from 'react';
export default function Modal({ children, label, onClose, className = 'modal-backdrop' }: {
    children: ReactNode;
    label: string;
    onClose: () => void;
    className?: string;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => { const dialog = ref.current, previous = document.activeElement; if (!dialog)
        return; dialog.showModal(); return () => { dialog.close(); if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus(); }; }, []);
    return <dialog ref={ref} className={className} aria-label={label} onKeyDown={e => { if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
    } if (e.key !== 'Tab')
        return; const elements = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(x => x.getClientRects().length > 0); const first = elements[0], last = elements.at(-1); if (!first) {
        e.preventDefault();
        return;
    } if (e.shiftKey && (document.activeElement === first || !e.currentTarget.contains(document.activeElement))) {
        e.preventDefault();
        last?.focus();
    }
    else if (!e.shiftKey && (document.activeElement === last || !e.currentTarget.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
    } }} onCancel={e => { e.preventDefault(); onClose(); }}>{children}</dialog>;
}
