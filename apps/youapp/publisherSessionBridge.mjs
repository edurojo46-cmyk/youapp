// Same-origin session bridge only. Does not create users, change permissions or publish.
export function mountPublisherSession({host,frame,auth,onStatus=()=>{},timeoutMs=8000}){
 let disposed=false,request=0;
 const post=session=>{if(disposed)return;const token=session?.user&&!session.user.is_anonymous?session.access_token:null,email=session?.user&&!session.user.is_anonymous?session.user.email||null:null;frame.contentWindow?.postMessage({type:'YOUAPP_PUBLISHER_SESSION',token,email},host.location.origin);onStatus(token?'Sesión conectada ('+(email||'usuario')+').':'Podés preparar el video. Iniciá sesión para guardar o publicar.');};
 const refresh=async()=>{const serial=++request;let timer;
  try{const result=await Promise.race([auth.getSession(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SESSION_TIMEOUT')),timeoutMs);})]);if(!disposed&&serial===request)post(result.data?.session);}
  catch{if(!disposed&&serial===request){post(null);onStatus('No se pudo comprobar la sesión. Podés ver el formulario y volver a cargar esta página.');}}
  finally{clearTimeout(timer);}
 };
 const message=event=>{if(event.origin!==host.location.origin||event.source!==frame.contentWindow||event.data?.type!=='YOUAPP_PUBLISHER_AUTH')return;void refresh();};
 host.addEventListener('message',message);frame.addEventListener('load',refresh);
 const subscription=auth.onAuthStateChange?.((_event,session)=>{request++;post(session);});
 void refresh();
 return()=>{disposed=true;request++;host.removeEventListener('message',message);frame.removeEventListener('load',refresh);subscription?.data?.subscription?.unsubscribe();};
}
