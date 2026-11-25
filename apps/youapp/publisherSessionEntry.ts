import {mountPublisherSession} from './publisherSessionBridge.mjs';
const status=document.getElementById('publisher-session-status');
const frame=document.getElementById('publisher-frame') as HTMLIFrameElement;
const loginForm=document.getElementById('quick-login-form') as HTMLFormElement|null;
const emailInput=document.getElementById('quick-email') as HTMLInputElement|null;
const passInput=document.getElementById('quick-password') as HTMLInputElement|null;
const show=(text:string)=>{
 if(status)status.textContent=text;
 if(loginForm)loginForm.style.display=text.includes('Sesión conectada')?'none':'flex';
};
async function start(){
 try{
  const {supabase}=await import('../../packages/auth/index.ts');
  const cleanup=mountPublisherSession({host:window,frame,auth:supabase.auth,onStatus:show});
  if(loginForm&&emailInput&&passInput){
   loginForm.onsubmit=async(e)=>{
    e.preventDefault();
    show('Iniciando sesión en YOUAPP…');
    const {error}=await supabase.auth.signInWithPassword({email:emailInput.value.trim(),password:passInput.value});
    if(error){show('Error al entrar: '+error.message);}
    else{passInput.value='';show('Sesión conectada.');}
   };
  }
  window.addEventListener('message',async(event)=>{
   if(event.origin!==window.location.origin||event.source!==frame?.contentWindow||event.data?.type!=='YOUAPP_PUBLISHER_LOGIN')return;
   const email=String(event.data.email||'').trim();
   const password=String(event.data.password||'');
   show('Iniciando sesión en YOUAPP…');
   const {data,error}=await supabase.auth.signInWithPassword({email,password});
   if(error){
    show('Error al entrar: '+error.message);
    frame?.contentWindow?.postMessage({type:'YOUAPP_PUBLISHER_LOGIN_RESULT',ok:false,error:error.message},window.location.origin);
   }else{
    show('Sesión conectada.');
    frame?.contentWindow?.postMessage({type:'YOUAPP_PUBLISHER_SESSION',token:data.session?.access_token||null},window.location.origin);
    frame?.contentWindow?.postMessage({type:'YOUAPP_PUBLISHER_LOGIN_RESULT',ok:true},window.location.origin);
   }
  });
  window.addEventListener('pagehide',cleanup,{once:true});
 }catch{show('El formulario está disponible, pero no se pudo iniciar la sesión. Volvé a cargar esta página.');}
}
void start();
