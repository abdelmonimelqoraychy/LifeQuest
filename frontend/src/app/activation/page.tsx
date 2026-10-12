'use client';
import { getStorageAccessState } from '@/lib/storageAccess';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import CinematicPlayer from '@/components/cinematics/CinematicPlayer';
import {readProfile,PROFILE_KEY} from '@/lib/profile';
import {useStoredData} from '@/lib/useStoredData';
export default function ActivationPage(){const router=useRouter(),profile=useStoredData(PROFILE_KEY,readProfile,null);useEffect(()=>{if(profile.ready&&!profile.error&&!profile.data&&getStorageAccessState().status==='ready')router.replace('/onboarding');},[profile.ready,profile.error,profile.data,router]);if(profile.error)return <main><p role='alert'>{profile.error}</p><a href='/hunter-core'>Exporter les données</a></main>;if(!profile.data)return <main>Chargement…</main>;return <CinematicPlayer fullscreen src='/cinematics/player-activation.mp4' title='YOU ARE A PLAYER' subtitle='Ton aventure commence maintenant.' onComplete={()=>router.replace('/dashboard')}/>;}
