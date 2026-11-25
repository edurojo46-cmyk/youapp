import React,{useEffect,useRef,useState} from 'react';
import {supabase} from '../../lib/supabase';
type Mission={key:string;missionId:string;title:string;status:string;stages:Record<string,string>;executions:number;canStart:boolean;humanApproved:false};
const base='/api/user/atlas-video-missions';
const labels:Record<string,string>={READY:'Preparada',RUNNING:'Entrega en curso',PAUSED_REVIEW:'Pausada: requiere revisión',PAUSED_BUDGET:'Presupuesto agotado',STAGES_COMPLETE_HUMAN_REVIEW_PENDING:'Etapas completas: revisión pendiente',DELIVERED_REVIEW_PENDING:'Entregada: revisión creativa pendiente'};
export default function AtlasCloudMissionLivePanel(){
 const [missions,setMissions]=useState<Mission[]>([]),[selected,setSelected]=useState<Mission|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
 const generation=useRef(0),polls=useRef(0),inFlight=useRef(false);
 useEffect(()=>{
  const {data}=supabase.auth.onAuthStateChange(()=>{generation.current++;setMissions([]);setSelected(null);setLoaded(false);setError('');setBusy(false);});
  return()=>{generation.current++;data.subscription.unsubscribe();};
 },[]);
 async function request(suffix:string,method='GET'){
  const {data,error:authError}=await supabase.auth.getSession();
  if(authError||!data.session||data.session.user.is_anonymous)throw Error('Iniciá sesión con tu cuenta registrada de YOUAPP.');
  const response=await fetch(base+suffix,{method,cache:'no-store',headers:{Authorization:'Bearer '+data.session.access_token,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{}),signal:AbortSignal.timeout(12000)});
  if(response.status===404)throw Error('El seguimiento aún no está activado en el servidor.');
  let value;try{value=await response.json();}catch{throw Error('El seguimiento aún no está disponible en el servidor.');}
  if(!response.ok)throw Error(value.error||'No se pudo consultar la misión.');
  return value;
 }
 async function query(key?:string,start=false){
  if(inFlight.current)return;inFlight.current=true;
  const version=generation.current;setBusy(true);setError('');
  try{
   const result=await request(key?'/'+encodeURIComponent(key)+(start?'/start':''):'',start?'POST':'GET');
   if(version!==generation.current)return;
   if(key){setSelected(result);setMissions(old=>old.map(x=>x.key===key?result:x));}
   else{setMissions(result.missions);setLoaded(true);setSelected(null);}
  }catch(e){if(version===generation.current)setError(e instanceof Error?e.message:'No se pudo consultar.');}
  finally{inFlight.current=false;if(version===generation.current)setBusy(false);}
 }
 useEffect(()=>{
  if(selected?.status!=='RUNNING'||error)return;
  const timer=setInterval(()=>{if(document.visibilityState==='hidden')return;if(polls.current++>=24){setError('Se pausó la consulta automática. Actualizá el estado manualmente; no vuelvas a iniciar la entrega.');return;}void query(selected.key);},5000);
  return()=>clearInterval(timer);
 },[selected?.key,selected?.status,error]);
 return <section aria-label="Misiones de video" style={{maxWidth:1240,margin:'0 auto 16px',padding:16,border:'1px solid #334155',borderRadius:12,background:'#111827',color:'#e2e8f0'}}>
  <strong>Misiones de video</strong>
  <p>Consultá tus producciones preparadas y autorizadas. Iniciar entrega utiliza el montaje existente; la aprobación creativa sigue pendiente.</p>
  <button disabled={busy} onClick={()=>{polls.current=0;void query();}}>Consultar misiones</button>
  {loaded&&!missions.length&&<p>No hay producciones preparadas habilitadas para tu cuenta.</p>}
  <ul>{missions.map(m=><li key={m.key}><button disabled={busy} onClick={()=>{polls.current=0;void query(m.key);}}>{m.title}</button> · {labels[m.status]||'Estado desconocido'}</li>)}</ul>
  {selected&&<div><p>{selected.missionId} · {labels[selected.status]||'Estado desconocido'} · Etapas ejecutadas: {selected.executions}</p>
   {Object.entries(selected.stages).map(([id,status])=><p key={id}>{id}: {status}</p>)}
   <button disabled={busy} onClick={()=>{polls.current=0;void query(selected.key);}}>Actualizar estado</button>
   {selected.canStart&&<button disabled={busy} onClick={()=>{polls.current=0;void query(selected.key,true);}}>Iniciar entrega autorizada</button>}
  </div>}
  {error&&<p role="alert" style={{color:'#fca5a5'}}>{error}</p>}
 </section>;
}
