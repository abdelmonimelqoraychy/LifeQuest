import { withStorageLock, notifyStorage } from '@/lib/storage';
import { assertBusinessStorageAccess } from '@/lib/storageAccess';
import { isRecord, text, timestamp } from '@/lib/validation';
import type { HunterProfile } from '@/types';
export const PROFILE_KEY = 'lifequest-profile-v1';
export function validProfile(v: unknown): v is HunterProfile {
    return isRecord(v) && text(v.name) && !!v.name.trim() && v.name.length <= 40 && typeof v.age === 'number' && Number.isInteger(v.age) && v.age >= 13 && v.age <= 120 && text(v.gender) && ['male', 'female', 'other', 'prefer_not_to_say'].includes(v.gender) && text(v.avatar) && ['male', 'female'].includes(v.avatar) && Array.isArray(v.goals) && v.goals.every(text) && v.onboardingCompleted === true && timestamp(v.createdAt);
}
export function readProfile(): HunterProfile | null {assertBusinessStorageAccess();
    const raw = localStorage.getItem(PROFILE_KEY);assertBusinessStorageAccess();
    if (raw === null)
        return null;
    const v: unknown = JSON.parse(raw);
    if (!validProfile(v))
        throw Error('Profil LifeQuest invalide. Les données sont conservées.');
    assertBusinessStorageAccess();return v;
}

export function saveProfile(profile: HunterProfile) { return withStorageLock(()=>{if(!validProfile(profile))throw Error("Profil invalide");assertBusinessStorageAccess();localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));notifyStorage();});}
