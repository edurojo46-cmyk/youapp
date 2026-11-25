import {createClient} from '@supabase/supabase-js';
const PROJECT='https://jtnurafmngaxdwlzpvxv.supabase.co';
const CANONICAL=Object.freeze({id:'canonical_entities',table:'atlas_canonical_entities',columns:'canonical_entity_id,tenant_id,canonical_name,entity_type,status',ownerField:'tenant_id',idField:'canonical_entity_id',activeOnly:true});
const PUBLICATIONS=Object.freeze({id:'owned_publication_drafts',table:'youapp_social_publishing_posts',columns:'id,owner_id,title,created_at,media_bytes',ownerField:'owner_id',idField:'id',activeOnly:false});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function publicKey(key){
 if(typeof key!=='string')return false;
 if(key.startsWith('sb_publishable_'))return true;
 try{return JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon';}catch{return false;}
}
function createReadPilot({url,publishableKey,fetchImpl=fetch},spec){
 const TABLE='/rest/v1/'+spec.table,COLUMNS=spec.columns;
 if(url!==PROJECT||!publicKey(publishableKey))throw Error('PUBLIC_YOUAPP_CONFIGURATION_REQUIRED');
 return Object.freeze({async read(accessToken){
  if(typeof accessToken!=='string'||!accessToken||accessToken.length>16000)throw Error('REGISTERED_SESSION_REQUIRED');
  let tenant=null,requests=0;
  const boundedFetch=async(raw,init={})=>{
   const target=new URL(typeof raw==='string'?raw:raw.url),method=(init.method||'GET').toUpperCase();
   if(target.origin!==PROJECT||target.username||target.password||method!=='GET'||init.body)throw Error('READ_ONLY_TRANSPORT_BLOCKED');
   if(target.pathname!=='/auth/v1/user'&&target.pathname!==TABLE)throw Error('READ_ONLY_TRANSPORT_BLOCKED');
   if(target.pathname===TABLE&&(!tenant||target.searchParams.get(spec.ownerField)!=='eq.'+tenant||target.searchParams.get('limit')!=='5'||target.searchParams.get('select')!==COLUMNS||(spec.activeOnly&&target.searchParams.get('status')!=='eq.ACTIVE')))throw Error('BOUNDED_TENANT_FILTER_REQUIRED');
   if(++requests>2)throw Error('READ_REQUEST_BUDGET_EXCEEDED');
   const signal=init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000);
   const response=await fetchImpl(target.href,{...init,method:'GET',redirect:'error',signal});
   const reader=response.body?.getReader();if(!reader)return response;
   const chunks=[];let size=0;try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>65536){await reader.cancel();throw Error('READ_RESPONSE_TOO_LARGE');}chunks.push(item.value);}}finally{reader.releaseLock();}
   const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
   return new Response(bytes,{status:response.status,statusText:response.statusText,headers:response.headers});
  };
  const client=createClient(PROJECT,publishableKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:'Bearer '+accessToken},fetch:boundedFetch}});
  const auth=await client.auth.getUser(accessToken),user=auth.data?.user;
  if(auth.error||!user||!UUID.test(user.id)||user.is_anonymous!==false)throw Error('REGISTERED_SESSION_REQUIRED');
  tenant=spec.activeOnly?(user.app_metadata?.tenant_id??user.id):user.id;
  if(typeof tenant!=='string'||!UUID.test(tenant))throw Error('TRUSTED_TENANT_CONTEXT_REQUIRED');
  const started=performance.now();
  let query=client.from(spec.table).select(COLUMNS).eq(spec.ownerField,tenant);
  query=spec.activeOnly?query.eq('status','ACTIVE'):query.order('created_at',{ascending:false});
  const result=await query.limit(5).abortSignal(AbortSignal.timeout(5000));
  if(result.error||!Array.isArray(result.data))throw Error('BOUNDED_READ_NOT_CONFIRMED');
  if(result.data.length>5||result.data.some(r=>r[spec.ownerField]!==tenant||!UUID.test(r[spec.idField])||(spec.activeOnly&&r.status!=='ACTIVE')))throw Error('TENANT_OR_RESULT_BOUNDARY_VIOLATION');
  return Object.freeze({mode:spec.activeOnly?'ISOLATED_AUTHENTICATED_CANONICAL_READ':'ISOLATED_AUTHENTICATED_OWNED_PUBLICATION_READ',source:spec.id,status:result.data.length?'READ_COMPLETE':'NO_VISIBLE_RECORDS',identityVerified:true,scope:spec.activeOnly?'CANONICAL_ENTITIES_ONLY':'OWNED_VIDEO_DRAFT_METADATA_ONLY',maxRows:5,requests,readDurationMs:performance.now()-started,rows:result.data.map(r=>Object.freeze(spec.activeOnly?{id:r.canonical_entity_id,name:String(r.canonical_name||'').slice(0,300),entityType:String(r.entity_type||''),status:r.status}:{id:r.id,name:String(r.title||'Video sin título').slice(0,300),entityType:'VIDEO_DRAFT',status:'SAVED_METADATA',createdAt:String(r.created_at||''),mediaBytes:r.media_bytes!==null&&r.media_bytes!==undefined&&Number.isSafeInteger(Number(r.media_bytes))&&Number(r.media_bytes)>=0?Number(r.media_bytes):null})),verifiedFacts:[],note:spec.activeOnly?'Lectura bajo RLS. Una entidad visible no certifica sus atributos ni acredita conocimiento completo.':'Metadatos propios bajo RLS. Guardado no significa publicado. No se copió información al grafo canónico.'});
 }});
}

export function createCanonicalReadPilot(configuration){return createReadPilot(configuration,CANONICAL);}
export function createOwnedPublicationReadPilot(configuration){return createReadPilot(configuration,PUBLICATIONS);}
