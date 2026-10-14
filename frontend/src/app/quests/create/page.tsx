'use client';
import { Suspense } from 'react';
import HunterWorkspace from '@/components/hunter/HunterWorkspace';
export default function CreateQuestPage() { return <Suspense fallback={<main>Chargement…</main>}><HunterWorkspace section="create" /></Suspense>; }
