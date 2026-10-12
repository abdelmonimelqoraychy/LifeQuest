'use client';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { getStorageAccessState, storageAccessServerSnapshot, subscribeStorageAccess } from '@/lib/storageAccess';
import RecoveryPanel from './RecoveryPanel';

export default function StorageAccessBoundary({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribeStorageAccess, getStorageAccessState, storageAccessServerSnapshot);
  const [busy,setBusy]=useState(false),[result,setResult]=useState<{message:string;error:boolean}|null>(null);
  if (state.status === 'ready'&&!busy) return <>{result&&<p role={result.error?'alert':'status'} style={{padding:'1rem'}}>{result.message}</p>}{children}</>;
  if (state.status === 'checking') return <main aria-busy="true"><p role="status">{state.message}</p></main>;
  return <RecoveryPanel initialMessage={state.message} onBusy={setBusy} onResult={(message,error)=>setResult({message,error})}/>;
}
