import {supabase} from '../../packages/auth/index.ts';
import {supabaseUrl,supabaseAnonKey} from '../../src/lib/supabase.ts';
import {createCanonicalReadPilot,createOwnedPublicationReadPilot} from '../../src/lib/atlasGeneralGovernance/CanonicalReadPilot.mjs';
const button=document.getElementById('read') as HTMLButtonElement,source=document.getElementById('source') as HTMLSelectElement,state=document.getElementById('state')!,results=document.getElementById('results')!,detail=document.getElementById('detail')!;
let running=false;
source.onchange=()=>{results.replaceChildren();state.textContent='Fuente seleccionada. Pulsá Consultar para leer únicamente esa fuente.';detail.textContent='Todavía no consultada.';};
button.onclick=async()=>{
 if(running)return;running=true;button.disabled=true;source.disabled=true;results.replaceChildren();state.textContent='Verificando tu sesión y los permisos de lectura…';
 try{
  const session=await Promise.race([supabase.auth.getSession(),new Promise<never>((_,reject)=>setTimeout(()=>reject(Error('SESSION_TIMEOUT')),8000))]);
  const token=session.data.session?.access_token;if(session.error||!token)throw Error('REGISTERED_SESSION_REQUIRED');
  const factory=source.value==='owned_publication_drafts'?createOwnedPublicationReadPilot:createCanonicalReadPilot;
  const value=await factory({url:supabaseUrl,publishableKey:supabaseAnonKey}).read(token);
  state.textContent=value.status==='READ_COMPLETE'?'Lectura autenticada completada en la fuente seleccionada.':'Sin registros visibles en esta fuente para tu sesión. No implica que Atlas esté vacío.';
  for(const row of value.rows){const item=document.createElement('li');item.textContent=row.name+' · '+row.entityType+' · '+row.status;results.append(item);}
  detail.textContent=value.rows.length+' registros · máximo 5 · '+value.readDurationMs.toFixed(0)+' ms de lectura · '+value.note;
 }catch(error){
  const code=error instanceof Error?error.message:'READ_NOT_CONFIRMED';
  state.textContent=code==='REGISTERED_SESSION_REQUIRED'?'Necesitás iniciar sesión con una cuenta registrada de YOUAPP.':'La lectura no se confirmó. No se ampliaron permisos ni se modificaron datos.';
  detail.textContent='Sin resultado certificado. Código: '+code;
 }finally{running=false;button.disabled=false;source.disabled=false;}
};
