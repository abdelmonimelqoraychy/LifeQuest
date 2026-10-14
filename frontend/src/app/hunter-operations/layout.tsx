import ProtectedHunter from '@/components/auth/ProtectedHunter';
import type { ReactNode } from 'react';
export const dynamic = 'force-dynamic';
export default function Layout({ children }: { children: ReactNode }) { return <ProtectedHunter>{children}</ProtectedHunter>; }
