import React, { useState } from 'react';
type Identity = { slot:number; name:string; platforms:{ platform:string; doNotRecreate:boolean; status?:string }[] };
const topics:Record<string,string> = {
  'actualidad.tv':'Actualidad y noticias en videos breves, con contexto, fuentes y fecha de actualización.',
  'finanzas.tv':'Finanzas y economía explicadas de forma clara. Contenido informativo y educativo.',
  'riqueza.tv':'Historias e ideas sobre emprendimiento, trabajo y creación de valor.',
  'salud.tv':'Información general sobre salud y bienestar basada en fuentes identificadas. No reemplaza la consulta profesional.',
  'cultura.tv':'Historias, arte, literatura y patrimonio cultural en videos breves.',
  'humor.tv':'Humor y entretenimiento en videos breves.',
  'deporte.tv':'Historias y actualidad del deporte, con contexto y fuentes.',
  'futbol.tv':'Historias y actualidad del fútbol, con contexto y fuentes.'
};
export default function AtlasSocialChannelGuide({identities,onLink,linkingReady}:{identities:Identity[];onLink:()=>Promise<void>;linkingReady:boolean}) {
  const [slot,setSlot]=useState(2);
  const identity=identities.find(i=>i.slot===slot);
  if(!identity)return null;
  const youtube=identity.platforms.find(p=>p.platform==='YOUTUBE');
  const preserve=Boolean(youtube?.doNotRecreate);
  const pendingAuth=youtube?.status==='CREATED_PENDING_ATLAS_AUTHORIZATION';
  const description=topics[identity.name]||'Historias y actualidad sobre justicia social, con contexto y fuentes.';
  return <section aria-label="Asistente de preparación de canales" style={{padding:18,marginBottom:18,border:'1px solid #475569',borderRadius:10}}>
    <h3 style={{marginTop:0}}>Asistente de Atlas: preparar un canal</h3>
    <label>Canal de trabajo <select value={slot} onChange={e=>setSlot(Number(e.target.value))} style={{marginLeft:8,padding:8,background:'#0f172a',color:'#e2e8f0'}}>
      {identities.filter(i=>i.name).map(i=><option key={i.slot} value={i.slot}>{i.name}</option>)}
    </select></label>
    <p>Nombre propuesto: <strong>{identity.name}</strong>. El identificador público depende de su disponibilidad en YouTube.</p>
    <label>Descripción propuesta para revisar<textarea key={slot} readOnly value={description} rows={3} style={{display:'block',width:'100%',boxSizing:'border-box',marginTop:8,padding:10,background:'#0f172a',color:'#e2e8f0'}} /></label>
    <ol style={{lineHeight:1.8}}>
      <li>Comprobar los canales de tu cuenta de Google y buscar este nombre antes de crear.</li>
      <li>{pendingAuth?'Este canal ya fue creado en YouTube: conservarlo y completar su vinculación con Atlas.':preserve?'Este canal ya figura en Atlas: conservarlo y comprobar su identidad; no recrearlo.':'Si ya existe, usar ese canal. Si falta, crearlo en YouTube con el nombre y la descripción revisados.'}</li>
      <li>Volver a Atlas, vincular el canal y elegir su identidad correcta en Google.</li>
      <li>Comprobar el nombre y el ID devueltos en la lista de cuentas. La preparación no activa el calendario.</li>
    </ol>
    <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
      <a href="https://www.youtube.com/channel_switcher" target="_blank" rel="noopener noreferrer" style={{color:'#93c5fd'}}>1. Comprobar o crear en YouTube</a>
      <button type="button" disabled={!linkingReady||(preserve&&!pendingAuth)} onClick={onLink} style={{padding:8,cursor:'pointer'}}>2. Autorizar vinculación con Atlas</button>
    </div>
    <p style={{fontSize:13,color:'#fcd34d',marginBottom:0}}>{pendingAuth ? 'Canal creado y comprobado en YouTube; falta autorizar su conexión con Atlas.' : 'Esta guía no crea cuentas ni confirma autorizaciones.'} Los canales nuevos se vinculan con la publicación deshabilitada.</p>
  </section>;
}
