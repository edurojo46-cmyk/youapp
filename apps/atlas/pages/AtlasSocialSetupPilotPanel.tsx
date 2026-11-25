import React, { useEffect, useState } from 'react';
import AtlasSocialChannelGuide from './AtlasSocialChannelGuide';
type Destination = { platform: string; doNotRecreate: boolean; existingAccountId: string | null; status?: string };
type SetupPlan = {
  targetEditorialIdentities: number; namedEditorialIdentities: number;
  publication: { desiredPostsPerAccountPerDay: number; enabled: boolean; schedulerEnabled: boolean };
  identities: { slot: number; name: string; platforms: Destination[] }[];
  connectionInventory: { observedAt: string };
};
const labels: Record<string,string> = { YOUTUBE:'YouTube', FACEBOOK:'Facebook', INSTAGRAM:'Instagram', TELEGRAM:'Telegram', TIKTOK:'TikTok', NOSTR:'Nostr', REDDIT:'Reddit' };
export default function AtlasSocialSetupPilotPanel() {
  const [plan,setPlan]=useState<SetupPlan|null>(null);
  const [error,setError]=useState(false);
  const [linkingReady,setLinkingReady]=useState(false);
  const [linkError,setLinkError]=useState('');
  useEffect(()=>{const controller=new AbortController();
    fetch('/api/atlas/broadcast/oauth/youtube/capabilities',{signal:controller.signal})
      .then(r=>r.ok?r.json():null)
      .then(d=>setLinkingReady(Boolean(d?.version===2 && d.isolatedChannelTokens && d.selectedAccountRouting && d.newConnectionsPublishEnabled===false)))
      .catch(()=>setLinkingReady(false));
    return ()=>controller.abort();
  },[]);
  const linkExistingChannel=async()=>{
    setLinkError('');
    try{
      const response=await fetch('/api/atlas/broadcast/oauth/youtube/url');
      const data=await response.json();
      if(!response.ok||!data.success||!data.authUrl)throw Error('No se pudo iniciar la vinculación.');
      const url=new URL(data.authUrl);
      if(url.protocol!=='https:'||url.hostname!=='accounts.google.com')throw Error('Destino de autorización inválido.');
      window.location.assign(url.toString());
    }catch(e){setLinkError(e instanceof Error?e.message:'No se pudo iniciar la vinculación.');}
  };
  useEffect(()=>{const controller=new AbortController();
    fetch('/data/atlas_social_setup_pilot_v2.json',{signal:controller.signal,cache:'no-store'})
      .then(r=>{if(!r.ok)throw Error('SETUP_UNAVAILABLE');return r.json();})
      .then(data=>setPlan(data)).catch(e=>{if(e.name!=='AbortError')setError(true);});
    return ()=>controller.abort();
  },[]);
  if(error)return <section style={{padding:20,border:'1px solid #64748b',borderRadius:12,color:'#cbd5e1'}}>No se pudo cargar la preparación de los canales. Las cuentas existentes se mantienen debajo.</section>;
  if(!plan)return null;
  return <section aria-label="Preparación de canales" style={{padding:24,border:'1px solid #334155',borderRadius:16,background:'#111827',color:'#e2e8f0'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'center'}}>
      <h2 style={{fontSize:22,margin:0}}>Preparación de tus canales</h2>
      <strong style={{padding:'6px 12px',borderRadius:20,background:'#422006',color:'#fde68a'}}>Publicación pausada</strong>
    </div>
    <p style={{color:'#cbd5e1',lineHeight:1.6}}>{plan.namedEditorialIdentities} de {plan.targetEditorialIdentities} nombres definidos. Objetivo futuro: {plan.publication.desiredPostsPerAccountPerDay} publicaciones diarias por cuenta. El calendario permanece sin activar.</p>
    <p style={{color:'#94a3b8',fontSize:13,lineHeight:1.6}}>Estos son nombres preparados, no nuevas cuentas conectadas. Primero se comprueba qué páginas existen y después se crean las faltantes con acceso del propietario. Justicia Social.tv conserva la conexión del canal ya registrado como justicia social.</p>
    <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',marginBottom:16}}><a href="https://www.youtube.com/channel_switcher" target="_blank" rel="noopener noreferrer" style={{padding:'10px 16px',borderRadius:8,background:'#1d4ed8',color:'white',textDecoration:'none',fontWeight:700}}>Abrir canales de YouTube en este equipo</a><span style={{fontSize:13,color:'#cbd5e1'}}>Creá solo los faltantes. Conservá Justicia Social.</span></div>{linkingReady ? <div style={{marginBottom:18}}><button type="button" onClick={linkExistingChannel} style={{padding:'10px 16px',border:0,borderRadius:8,background:'#047857',color:'white',fontWeight:700,cursor:'pointer'}}>Vincular un canal existente con Atlas</button><p style={{fontSize:13,color:'#6ee7b7'}}>Elegí el canal en Google. Se vincula por separado y con la publicación deshabilitada. Las conexiones verificadas aparecen en la lista de cuentas.</p></div> : <p style={{fontSize:13,color:'#fcd34d',marginBottom:18}}>La vinculación de canales nuevos espera la activación de la corrección del servicio. Justicia Social se conserva y no se activa ninguna publicación.</p>}
    {linkError && <p role="alert" style={{color:'#fca5a5'}}>{linkError}</p>}
    <AtlasSocialChannelGuide identities={plan.identities} onLink={linkExistingChannel} linkingReady={linkingReady} />
    <p style={{fontSize:13,color:'#cbd5e1'}}>Recuperación ante un rechazo: comprobar si el canal existe, renovar la administración y probar un formulario nuevo una vez. Si YouTube pide cambiar el nombre, revisar una variante visible conservando la identidad editorial y el identificador. Un identificador disponible no confirma que el canal haya sido creado. Guardar el mensaje exacto y no atribuirlo a una cuota sin evidencia.</p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12}}>
      {plan.identities.map(identity=><details key={identity.slot} style={{padding:16,border:'1px solid #334155',borderRadius:10,background:'#0f172a'}}>
        <summary style={{cursor:'pointer',fontWeight:700}}>{identity.slot}. {identity.name}</summary>
        <ul style={{listStyle:'none',padding:0,marginBottom:0,fontSize:13,lineHeight:1.9}}>
          {identity.platforms.map(p=><li key={p.platform} style={{color:p.doNotRecreate?'#6ee7b7':'#cbd5e1'}}>
            {labels[p.platform]||p.platform}: {(p.status==='CREATION_RATE_LIMITED_FACEBOOK'||p.status==='WAITING_FACEBOOK_CREATION_LIMIT')?'en espera: límite temporal de creación de Facebook':p.status==='CREATION_REJECTED_BY_YOUTUBE'?'creación rechazada por YouTube; pendiente':p.status==='CREATED_PENDING_ATLAS_AUTHORIZATION'?'creado; falta vincular con Atlas':p.doNotRecreate?'existente en Atlas; conservar':'pendiente de verificar y crear'}
          </li>)}
        </ul>
      </details>)}
      {plan.namedEditorialIdentities < plan.targetEditorialIdentities && <div style={{padding:16,border:'1px dashed #64748b',borderRadius:10,color:'#fcd34d'}}>10. Falta definir el nombre</div>}
    </div>
    <p style={{marginBottom:0,color:'#94a3b8',fontSize:12}}>Inventario consultado: {new Date(plan.connectionInventory.observedAt).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})}. Las conexiones existentes aún requieren comprobar vigencia antes de publicar.</p>
  </section>;
}