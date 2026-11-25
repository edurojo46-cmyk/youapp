import React, {useState} from 'react';
export interface ImportedCloudReceipt {
 schema:'ATLAS_CLOUD_DELIVERY_RECEIPT_V1';missionId:string;status:'DELIVERED_REVIEW_PENDING';
 bytes:number;sha256:string;recordedAt:string;localFinalFileCreated:false;humanApproved:false;
}
export function parseCloudMissionReceipt(text:string):ImportedCloudReceipt{
 if(text.length>32768)throw Error('El comprobante es demasiado grande.');
 const value=JSON.parse(text);
 if(value?.schema!=='ATLAS_CLOUD_DELIVERY_RECEIPT_V1'||typeof value.missionId!=='string'||!value.missionId.trim()||value.missionId.length>200||
    value.status!=='DELIVERED_REVIEW_PENDING'||!Number.isSafeInteger(value.bytes)||value.bytes<1024||value.bytes>45000000||
    typeof value.sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.sha256)||typeof value.recordedAt!=='string'||
    !Number.isFinite(Date.parse(value.recordedAt))||value.localFinalFileCreated!==false||value.humanApproved!==false)
  throw Error('El archivo no es un comprobante de entrega compatible.');
 // Whitelist fields: no owner, server paths, access URLs or keys enter the UI state.
 return {schema:value.schema,missionId:value.missionId,status:value.status,bytes:value.bytes,sha256:value.sha256,
  recordedAt:value.recordedAt,localFinalFileCreated:false,humanApproved:false};
}
export default function AtlasCloudMissionReceiptPanel(){
 const [receipt,setReceipt]=useState<ImportedCloudReceipt|null>(null),[error,setError]=useState('');
 return <section aria-label="Seguimiento de entrega" style={{maxWidth:1240,margin:'0 auto 16px',padding:'14px 18px',border:'1px solid #334155',borderRadius:12,background:'#111827',color:'#e2e8f0'}}>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
   <div><strong>Seguimiento de entrega</strong><p style={{margin:'5px 0',fontSize:13}}>Abrí el comprobante de una misión para consultar su estado informado.</p></div>
   <label style={{cursor:'pointer',padding:'8px 12px',border:'1px solid #64748b',borderRadius:8}}>Abrir comprobante
    <input aria-label="Abrir comprobante de misión" type="file" accept=".json,application/json" style={{display:'none'}} onChange={async event=>{
     const file=event.target.files?.[0];if(!file)return;setError('');setReceipt(null);
     try{if(file.size>32768)throw Error('El comprobante es demasiado grande.');setReceipt(parseCloudMissionReceipt(await file.text()));}
     catch(e){setError(e instanceof Error?e.message:'No se pudo leer el comprobante.');}
    }}/>
   </label>
  </div>
  {error&&<p role="alert" style={{color:'#fca5a5'}}>{error}</p>}
  {receipt&&<div style={{fontSize:13,lineHeight:1.7,overflowWrap:'anywhere'}}>
   <p style={{margin:'8px 0 0'}}>Misión: <strong>{receipt.missionId}</strong> · Entrega registrada · Revisión creativa pendiente.</p>
   <p style={{margin:0}}>{(receipt.bytes/1048576).toFixed(2)} MB · Huella: {receipt.sha256.slice(0,16)}… · {new Date(receipt.recordedAt).toLocaleString()}</p>
   <p style={{margin:'4px 0 0',color:'#94a3b8'}}>Comprobante importado; esta pantalla no consulta la nube ni confirma aprobación del usuario. Abrirlo no inicia un render.</p>
  </div>}
 </section>;
}
