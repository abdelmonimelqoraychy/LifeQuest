'use client';
import { getStorageAccessState } from '@/lib/storageAccess';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {useQuestSystem} from '@/lib/useQuestSystem';
import {useStoredData} from '@/lib/useStoredData';
import {readProfile,PROFILE_KEY} from '@/lib/profile';
export default function Entry(){const router=useRouter(),system=useQuestSystem(),profile=useStoredData(PROFILE_KEY,readProfile,null);const error=system.error||profile.error;
 useEffect(()=>{if(!system.ready||!profile.ready||error||getStorageAccessState().status!=='ready')return;const existing=localStorage.getItem('lifequest-v2-demo')!==null||localStorage.getItem('lifequest-quest-system-v1')!==null;if(getStorageAccessState().status!=='ready')return;router.replace(profile.data||existing?'/dashboard':'/onboarding');},[system.ready,profile.ready,profile.data,error,router]);
 return <main className='ob-page ob-center'>{error?<div><p role='alert'>{error}</p><a href='/hunter-core'>Exporter les données avant récupération</a></div>:<p>INITIALIZING LIFEQUEST SYSTEM…</p>}</main>;
}
