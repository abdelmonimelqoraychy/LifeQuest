'use client';
import { useEffect, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { subscribeStorageAccess } from '@/lib/storageAccess';
import { inspectImportRecovery, recoverImportJournal, exportRecoveryDiagnostic, RecoveryError,
  type RecoveryInspection } from '@/lib/importRecovery';
import css from './RecoveryPanel.module.css';

export default function RecoveryPanel({onBusy,onResult,initialMessage}:{onBusy:(busy:boolean)=>void;onResult:(message:string,error:boolean)=>void;initialMessage:string}) {
  const [diagnostic,setDiagnostic]=useState<RecoveryInspection|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false);
  const working=useRef(false),request=useRef(0);
  useEffect(()=>{
    let active=true;
    const refresh=()=>{const id=++request.current;void inspectImportRecovery().then(d=>{if(active&&id===request.current)setDiagnostic(d)}).catch(()=>{if(active)setDiagnostic({code:'D_UNAVAILABLE',phase:null,action:null,canExport:false,message:'Le stockage est inaccessible. Réessayez lorsque son accès est disponible.'})});};
    refresh();const stop=subscribeStorageAccess(refresh);return()=>{active=false;stop();};
  },[]);
  async function run(action:()=>Promise<void>){
    if(working.current)return;working.current=true;setBusy(true);onBusy(true);setError('');setNotice('');
    try{await action();}
    catch(e){const message=e instanceof RecoveryError?e.message:'Opération non confirmée. Réévaluez la situation et réessayez.';setError(message);onResult(message,true);}
    finally{working.current=false;setBusy(false);setConfirm(false);onBusy(false);}
  }
  const restore=diagnostic?.action==='restore-before';
  return <main className={css.page} aria-labelledby="storage-recovery-title" aria-busy={busy}>
    <h1 id="storage-recovery-title">Récupération des données LifeQuest</h1>
    <p>Les lectures, modifications et exports métier restent bloqués jusqu’à résolution. Vos données et le journal sont conservés.</p>
    <section className={css.panel} aria-labelledby="recovery-state-title">
      <h2 id="recovery-state-title">{diagnostic?.phase==='prepared'?'Import interrompu':diagnostic?.phase==='committed'?'Nettoyage de l’import en attente':'Vérification de la sauvegarde'}</h2>
      <p role={!diagnostic||!diagnostic.action&&diagnostic.code!=='D_NONE'?'alert':'status'}>{diagnostic?.message??(initialMessage||'Examen des données locales…')}</p>
      {diagnostic&&<p className={css.code}>Code de diagnostic : <code>{diagnostic.code}</code></p>}
      {error&&<p role="alert" className={css.error}>{error}</p>}
      {notice&&<p role="status">{notice}</p>}
      {busy&&<p role="status">Traitement en cours…</p>}
      <div className={css.actions}>
        {diagnostic?.action&&<button type="button" disabled={busy} onClick={()=>setConfirm(true)}>{restore?'Restaurer les données précédentes':'Finaliser l’import'}</button>}
        <button type="button" disabled={busy} onClick={()=>void run(async()=>{setDiagnostic(await inspectImportRecovery());})}>Réévaluer la situation</button>
      </div>
    </section>
    <section className={css.panel} aria-labelledby="recovery-export-title">
      <h2 id="recovery-export-title">Conserver un diagnostic local</h2>
      <p>Ce fichier peut contenir des informations personnelles. Conservez-le privé. Il est distinct d’une sauvegarde LifeQuest et ne peut pas être importé comme backup v1/v2.</p>
      <p>Le téléchargement reste sur votre appareil ; aucun envoi vers un serveur n’est effectué. Un journal dont le contenu ne peut pas être limité aux données LifeQuest est omis du fichier, sans être supprimé du navigateur.</p>
      <button type="button" disabled={busy||!diagnostic?.canExport} onClick={()=>void run(async()=>{
        const data=await exportRecoveryDiagnostic(),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
        const link=document.createElement('a');link.href=url;link.download='lifequest-recovery-diagnostic.json';link.click();URL.revokeObjectURL(url);
        setNotice(data.journalRawOmitted||data.recordKeysOmitted.length?'Diagnostic exporté avec omissions de confidentialité signalées dans le fichier. Les originaux restent conservés dans le navigateur.':'Diagnostic exporté localement.');
      })}>Exporter le diagnostic</button>
    </section>
    {confirm&&diagnostic?.journal&&<Modal label="Confirmer la récupération" onClose={()=>{if(!working.current)setConfirm(false)}}>
      <section className={css.confirm}>
        <h2>{restore?'Restaurer les données précédentes ?':'Finaliser cet import ?'}</h2>
        <p>{restore?'Cette action remplace les valeurs partielles de l’import par leur instantané précédent, après vérification. Elle ne fusionne pas les deux comptes.':'Cette action conserve les données importées et retire uniquement le journal lorsque toute la cible est vérifiée.'}</p>
        <div className={css.actions}>
          <button type="button" disabled={busy} onClick={()=>setConfirm(false)}>Annuler</button>
          <button type="button" disabled={busy} onClick={()=>void run(async()=>{
            await recoverImportJournal(diagnostic.journal!,true);
            onResult(restore?'Données précédentes restaurées et vérifiées.':'Import finalisé et données vérifiées.',false);
          })}>{restore?'Confirmer la restauration':'Confirmer la finalisation'}</button>
        </div>
      </section>
    </Modal>}
  </main>;
}
