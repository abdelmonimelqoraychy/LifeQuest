import type { ReactNode } from 'react';
import ProtectedHunter from '@/components/auth/ProtectedHunter';

export const dynamic = 'force-dynamic';

export default function EnglishAcademyLayout({ children }: { children: ReactNode }) {
  return <ProtectedHunter>{children}</ProtectedHunter>;
}
