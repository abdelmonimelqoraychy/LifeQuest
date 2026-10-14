import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

// The page verifies its SSR session and onboarding RPC state. A ProtectedHunter
// wrapper would redirect pending actors back to this same route.
export default function Layout({ children }: { children: ReactNode }) { return children; }
