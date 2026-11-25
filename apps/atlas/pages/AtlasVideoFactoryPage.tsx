import React, { useEffect, useState } from 'react';
import { Clapperboard, Copy, Check, Download, Film, Play, ShieldCheck, AlertCircle } from 'lucide-react';
import AtlasCloudMissionLivePanel from '../../../src/pages/tools/AtlasCloudMissionLivePanel.tsx';
import {supabase} from '../../../src/lib/supabase';

type Format = 'vertical' | 'horizontal' | 'cuadrado';
const genres = ['Automático','Documental','Informe deportivo','Informe periodístico','Humor','Película / ficción','Biografía','Publicidad','Videoclip','Educativo','Entrevista','Animación','Otro'];
type VideoRequest = {
  schema: 'ATLAS_VIDEO_FACTORY_REQUEST_V1';
  genre: string; subject: string; durationSeconds: number; quantity: number;
  format: Format; script: string; references: string[];
  rules: { existingFirst: true; cloudFirst: true; noPaidApis: true; noPublication: true; requireRealEvidenceForFacts: true; finalHumanApproval: true };
  status: 'PREPARED_NOT_DISPATCHED';
};

type FactoryReceipt = {id:string;status:string;blocker?:string;createdAt:string;productionStarted:boolean;videoUrl:string|null};

type ParallelDraftMission = {
  genre: string;
  customGenre: string;
  subject: string;
  seconds: string;
  quantity: string;
  format: Format;
  script: string;
  references: string;
  videoMixMode: 'atlas'|'raw'|'recreate'|'remaster'|'remaster_4k';
  avatarRole: 'none'|'profesora'|'periodista'|'relator'|'documentalista'|'custom';
  voiceGender: 'male'|'female';
  selectedElevenVoiceId: string;
  fxMode: 'auto'|'cinema'|'flash_tv'|'vintage'|'dynamic'|'none';
  zocaloMode: 'clean_none'|'floating_text'|'google_material_you'|'cinema_editorial'|'music_pill'|'tv_impact';
  screenMessage: string;
  avatarIntroMessage: string;
  avatarMidMessage: string;
  avatarMessage: string;
  customAvatarUrl: string;
  alacarteMusicUrl: string;
  alacarteScriptUrl: string;
  alacarteNoVoice: boolean;
  alacarteVisualUrls: string;
  alacarteVoiceUrl: string;
};

const inputStyle: React.CSSProperties = {width:'100%',boxSizing:'border-box',background:'#ffffff',color:'#172b4d',border:'1px solid #d9e4ed',borderRadius:12,padding:'13px 14px',font:'inherit',outlineOffset:2,boxShadow:'0 1px 2px rgba(28,65,95,0.025)'};
const labelStyle: React.CSSProperties = {display:'block',marginBottom:8,color:'#344c63',fontSize:13,fontWeight:600};
const cardStyle: React.CSSProperties = {background:'#ffffff',border:'1px solid #e5edf4',borderRadius:20,padding:24,boxShadow:'0 8px 34px rgba(52,100,139,0.045)'};
const genreIcons: Record<string,string> = {'Automático':'✦','Documental':'🎞️','Informe deportivo':'⚽','Informe periodístico':'📰','Humor':'🎭','Película / ficción':'🎬','Biografía':'👤','Publicidad':'📣','Videoclip':'🎵','Educativo':'📚','Entrevista':'🎙️','Animación':'✨','Otro':'＋'};
const elevenLabsSpanishVoices = [
  {id:'piper_davefx',name:'Piper · "Pipilin" (Voz Original ATLAS)',gender:'male' as const,role:'🎙️ La voz con la que veníamos trabajando',desc:'Voz neuronal Piper es_ES-davefx-medium ($0.00, 100% ilimitada en Google Colab sin API Key)',previewUrl:'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium/samples/speaker_0.mp3'},
  {id:'JBFqnCBsd6RMkjVDRZzb',name:'George · Orus (Google Studio / Neural HD / ElevenLabs)',gender:'male' as const,role:'🏛️ Narrador Documental e Historias',desc:'Voz masculina profunda de estudio (Google Gemini Studio Orus + Neural HD Alvaro · $0.00 gratis)',previewUrl:'https://storage.googleapis.com/eleven-public-prod/premade/voices/JBFqnCBsd6RMkjVDRZzb/eae50a0d-5a39-4795-9b1e-1d58f7f87e63.mp3'},
  {id:'XrExE9yKIg1WjnnlVkGX',name:'Matilda · Kore (Google Studio / Neural HD / ElevenLabs)',gender:'female' as const,role:'👩‍🏫 Docente / Storytelling y Enseñanza',desc:'Voz femenina cálida y didáctica de estudio (Google Gemini Studio Kore + Neural HD Elena · $0.00 gratis)',previewUrl:'https://storage.googleapis.com/eleven-public-prod/premade/voices/XrExE9yKIg1WjnnlVkGX/20291a6d-1e7f-45e4-9d85-a764997a2fdb.mp3'},
  {id:'EXAVITQu4vr4xnSDxMaL',name:'Sarah · Aoede (Google Studio / Neural HD / ElevenLabs)',gender:'female' as const,role:'📺 Conductora TV / Segura y Cálida',desc:'Voz femenina segura de televisión (Google Gemini Studio Aoede + Neural HD Dalia · $0.00 gratis)',previewUrl:'https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/57ab5344-ed96-46fc-b319-82dc1c89bf66.mp3'},
  {id:'cjVigY5qzO86Huf0OWal',name:'Eric · Charon (Google Studio / Neural HD / ElevenLabs)',gender:'male' as const,role:'🎙️ Periodista / Firme y Confiable',desc:'Voz masculina firme y periodística de estudio (Google Gemini Studio Charon + Neural HD Jorge · $0.00 gratis)',previewUrl:'https://storage.googleapis.com/eleven-public-prod/premade/voices/cjVigY5qzO86Huf0OWal/4d56a844-3fc5-4048-b8d9-daff582c2746.mp3'},
  {id:'IKne3meq5aSn9XLyUdCD',name:'Charlie · Fenrir (Google Studio / Neural HD / ElevenLabs)',gender:'male' as const,role:'⚽ Dinámico / Energético y Relato',desc:'Voz masculina enérgica y vibrante de estudio (Google Gemini Studio Fenrir + Neural HD Tomás · $0.00 gratis)',previewUrl:'https://storage.googleapis.com/eleven-public-prod/premade/voices/IKne3meq5aSn9XLyUdCD/52f3846a-eee1-43e4-bcd1-0280f20fe202.mp3'},
  {id:'CwhRBWXzGAHq8TQ4Fs17',name:'Roger · Enceladus (Google Studio / Neural HD / ElevenLabs)',gender:'male' as const,role:'🎬 Resonante / Conversacional',desc:'Voz masculina grave y conversacional de estudio (Google Gemini Studio Enceladus + Neural HD Gonzalo · $0.00 gratis)',previewUrl:'https://storage.googleapis.com/eleven-public-prod/premade/voices/CwhRBWXzGAHq8TQ4Fs17/f172f037-5e23-44ea-a08e-56ddb6447d5b.mp3'},
  {id:'bIHbv24MWmeRgasZH58o',name:'Will · Puck (Google Studio / Neural HD / ElevenLabs)',gender:'male' as const,role:'✨ Joven / Cercano y Optimista',desc:'Voz masculina joven y fresca de estudio (Google Gemini Studio Puck + Neural HD Lorenzo · $0.00 gratis)',previewUrl:'https://storage.googleapis.com/eleven-public-prod/premade/voices/bIHbv24MWmeRgasZH58o/9b17b1ba-98f6-4c6d-9da7-dc03a76bc50c.mp3'}
];

export default function AtlasVideoFactoryPage(){
  const [genre,setGenre] = useState('Automático');
  const [customGenre,setCustomGenre] = useState('');
  const [subject,setSubject] = useState('');
  const [seconds,setSeconds] = useState('60');
  const [quantity,setQuantity] = useState('1');
  const [format,setFormat] = useState<Format>('vertical');
  const [script,setScript] = useState('');
  const [references,setReferences] = useState('');
  const [newVideoUrl,setNewVideoUrl] = useState('');
  const [videoMixMode,setVideoMixMode] = useState<'atlas'|'raw'|'recreate'|'remaster'|'remaster_4k'>('atlas');
  const [avatarRole,setAvatarRole] = useState<'none'|'profesora'|'periodista'|'relator'|'documentalista'|'custom'>('none');
  const [voiceGender,setVoiceGender] = useState<'male'|'female'>('male');
  const [selectedElevenVoiceId,setSelectedElevenVoiceId] = useState('piper_davefx');
  const [elevenApiKey,setElevenApiKey] = useState('');
  const [playingPreviewVoiceId,setPlayingPreviewVoiceId] = useState<string|null>(null);
  const [fxMode,setFxMode] = useState<'auto'|'cinema'|'flash_tv'|'vintage'|'dynamic'|'none'>('auto');
  const [zocaloMode,setZocaloMode] = useState<'clean_none'|'floating_text'|'google_material_you'|'cinema_editorial'|'music_pill'|'tv_impact'>('clean_none');
  const [screenMessage,setScreenMessage] = useState('');
  const [previewCutIdx,setPreviewCutIdx] = useState(0);
  const [avatarIntroMessage,setAvatarIntroMessage] = useState('');
  const [avatarMidMessage,setAvatarMidMessage] = useState('');
  const [avatarMessage,setAvatarMessage] = useState('');
  const [customAvatarUrl,setCustomAvatarUrl] = useState('');
  const [alacarteMusicUrl,setAlacarteMusicUrl] = useState('');
  const [alacarteScriptUrl,setAlacarteScriptUrl] = useState('');
  const [alacarteNoVoice,setAlacarteNoVoice] = useState(false);
  const [alacarteVisualUrls,setAlacarteVisualUrls] = useState('');
  const [alacarteVoiceUrl,setAlacarteVoiceUrl] = useState('');
  const [newAlacarteVisualUrl,setNewAlacarteVisualUrl] = useState('');
  const [extractingScript,setExtractingScript] = useState(false);
  const [extractScriptStatus,setExtractScriptStatus] = useState('');
  const [veoPrompts,setVeoPrompts] = useState<any[]>([]);
  const [generatingVeo,setGeneratingVeo] = useState(false);
  const [veoStatus,setVeoStatus] = useState('');
  const [copiedVeoIdx,setCopiedVeoIdx] = useState<number|null>(null);
  const [copiedVaultCmd,setCopiedVaultCmd] = useState(false);
  const [copiedFlowExtractor,setCopiedFlowExtractor] = useState(false);
  const [parallelDrafts,setParallelDrafts] = useState<ParallelDraftMission[]>([]);
  const [activeDraftIdx,setActiveDraftIdx] = useState(0);
  const [prepared,setPrepared] = useState<VideoRequest|null>(null);
  const [message,setMessage] = useState('');
  const [showExample,setShowExample] = useState(false);
  const [showMissions,setShowMissions] = useState(false);
  const [dispatch,setDispatch] = useState<FactoryReceipt|null>(null);
  const [submitting,setSubmitting] = useState(false);
  const [existingArgonStatus,setExistingArgonStatus] = useState('');
  const [learningSummary,setLearningSummary] = useState<any>(null);
  const [verifiedDeliveries,setVerifiedDeliveries] = useState<any[]>([]);
  const [activeAutoMissions,setActiveAutoMissions] = useState<any[]>([]);
  const [selectedDeliveryId,setSelectedDeliveryId] = useState('justicia_social_taparelli_60s_v4');
  const [activeVideoUrl,setActiveVideoUrl] = useState<string|null>(null);
  const [activeCreditsUrl,setActiveCreditsUrl] = useState<string|null>(null);
  const [activeContactSheetUrl,setActiveContactSheetUrl] = useState<string|null>(null);
  const [directorNote,setDirectorNote] = useState('');
  const [feedbackStatus,setFeedbackStatus] = useState('');
  const [uploadingMedia,setUploadingMedia] = useState(false);
  const [uploadStatusMsg,setUploadStatusMsg] = useState('');
  const [uploadedFileLabels,setUploadedFileLabels] = useState<Record<string,string>>({});
  const [tickSec,setTickSec] = useState(0);
  const [liveVideoMeta,setLiveVideoMeta] = useState<{width:number;height:number;duration:number}|null>(null);
  const [compareSideBySide,setCompareSideBySide] = useState(false);
  const [compareOriginalId,setCompareOriginalId] = useState('');
  const [compareOriginalUrl,setCompareOriginalUrl] = useState<string|null>(null);
  const [compareOriginalMeta,setCompareOriginalMeta] = useState<{width:number;height:number;duration:number}|null>(null);
  const [zoomMagnifier,setZoomMagnifier] = useState(false);
  const [activePartIdx,setActivePartIdx] = useState<1|2|3>(1);
  const [autoAdvancePart,setAutoAdvancePart] = useState(false);
  const [assembledSingleBlobUrl,setAssembledSingleBlobUrl] = useState<string|null>(null);
  const [assemblingShards,setAssemblingShards] = useState(false);
  const [showFxPreviewV4,setShowFxPreviewV4] = useState(false);
  const [directorChatPrompt,setDirectorChatPrompt] = useState('');
  const [interpretingChatPrompt,setInterpretingChatPrompt] = useState(false);
  const [directorChatReply,setDirectorChatReply] = useState('');
  const [directorChatModelUsed,setDirectorChatModelUsed] = useState('');
  const [directorChatEngine,setDirectorChatEngine] = useState<'argon4'|'gemini'>('argon4');
  const [directorChatMessages,setDirectorChatMessages] = useState<Array<{
    role:'user'|'assistant';
    text:string;
    advisory?:string;
    model?:string;
    intent?:string;
    at:string;
  }>>([
    {
      role:'assistant',
      text:'¡Hola! Soy el Director ATLAS con Argon 4 (Gemma 4 26B + Gemini Flash · $0.00). Podés pedirme un video nuevo, modificar solo un bloque (ej. "cambiá el bloque 3 para nombrar a Güemes"), preguntarme cómo va el video en Colab o pedirme que audite/remasterice en 4K el último video entregado.',
      advisory:'Estándar activo: 1080p Full HD CRF 16 nativo + CAS 0.48 + Lanczos + prioridad óptica 4K/1080p.',
      model:'Argon 4 · gemma-4-26b-a4b-it + Gemini Cascade ($0.00)',
      intent:'WELCOME',
      at:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
    }
  ]);
  const selectedDeliveryObj=verifiedDeliveries.find((d:any)=>d.id===selectedDeliveryId);
  const hasPointerShards=Array.isArray(selectedDeliveryObj?.pointerShardUrls)&&selectedDeliveryObj.pointerShardUrls.length>=2;
  const basePart1Url=activeVideoUrl||(dispatch?.status==='DELIVERED_REVIEW_PENDING' && typeof dispatch.videoUrl==='string' &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/sign\/atlas-private-video-shares\//.test(dispatch.videoUrl)
    ? dispatch.videoUrl : null);
  const playbackUrl=hasPointerShards
    ? assembledSingleBlobUrl
    : (activePartIdx===2&&selectedDeliveryObj?.signedVideoPart2Url)
      ? selectedDeliveryObj.signedVideoPart2Url
      : (activePartIdx===3&&selectedDeliveryObj?.signedVideoPart3Url)
        ? selectedDeliveryObj.signedVideoPart3Url
        : basePart1Url;

  useEffect(()=>{
    setActivePartIdx(1);
    setAutoAdvancePart(false);
  },[selectedDeliveryId]);

  useEffect(()=>{
    const shardUrls:string[]=Array.isArray(selectedDeliveryObj?.pointerShardUrls)?selectedDeliveryObj.pointerShardUrls.filter(Boolean):[];
    if(shardUrls.length<2){
      setAssembledSingleBlobUrl(prev=>{if(prev)URL.revokeObjectURL(prev);return null;});
      setAssemblingShards(false);
      return;
    }
    let cancelled=false;
    let createdUrl:string|null=null;
    setAssemblingShards(true);
    Promise.all(shardUrls.map(async u=>{
      const r=await fetch(u);
      if(!r.ok)throw new Error('SHARD_FETCH_'+r.status);
      return await r.arrayBuffer();
    })).then(buffers=>{
      if(cancelled)return;
      const blob=new Blob(buffers,{type:'video/mp4'});
      createdUrl=URL.createObjectURL(blob);
      setAssembledSingleBlobUrl(prev=>{if(prev)URL.revokeObjectURL(prev);return createdUrl;});
      setAssemblingShards(false);
    }).catch(()=>{
      if(!cancelled)setAssemblingShards(false);
    });
    return ()=>{
      cancelled=true;
      if(createdUrl)URL.revokeObjectURL(createdUrl);
    };
  },[selectedDeliveryId, Array.isArray(selectedDeliveryObj?.pointerShardUrls)?selectedDeliveryObj.pointerShardUrls.join('|'):'']);

  const formatRemainingTime=(sec:number)=>{
    const s=Math.max(0,Math.round(sec));
    if(s<=0)return '¡Listo!';
    const m=Math.floor(s/60),r=s%60;
    return m>0?`Falta aprox. ${m} min ${r} s`:`Faltan aprox. ${r} s`;
  };

  const splitScreenMessageClauses=(rawMsg:string):string[]=>{
    const rawLines=String(rawMsg||'').replace(/\r/g,'\n').replace(/\|\|/g,'\n').split('\n').map(p=>p.trim()).filter(Boolean);
    const clauses:string[]=[];
    for(const rl of rawLines){
      const subParts=rl.split(/\.\.\.+|[.!?]+|;/).map(s=>s.trim()).filter(Boolean);
      for(let sp of subParts){
        sp=sp.replace(/^[,\s:;.-]+|[,\s:;.-]+$/g,'');
        if(!sp)continue;
        const wSp=sp.split(/\s+/);
        if(wSp.length>7){
          let splitDone=false;
          for(const conn of [' RECUERDA ',' CUANDO ',' DONDE ',' PARA ',' PORQUE ',' MIENTRAS ',' SIEMPRE ']){
            const idxConn=sp.toUpperCase().indexOf(conn);
            if(idxConn>8){
              const p1=sp.slice(0,idxConn).trim();
              const p2=sp.slice(idxConn+1).trim();
              if(p1)clauses.push(p1);
              if(p2)clauses.push(p2);
              splitDone=true;
              break;
            }
          }
          if(!splitDone){
            const midW=Math.max(3,Math.floor(wSp.length/2));
            clauses.push(wSp.slice(0,midW).join(' '));
            clauses.push(wSp.slice(midW).join(' '));
          }
        }else{
          clauses.push(sp);
        }
      }
    }
    return clauses.length>0?clauses:['UN NUEVO DÍA ES UN DÍA MUY ESPECIAL','RECUERDA HACER ALGO POR ALGUIEN','RECUERDA SER FELIZ'];
  };

  const detectLiveTypographyArchetype=(phraseText:string)=>{
    const musicLabel=uploadedFileLabels[alacarteMusicUrl.trim()]||alacarteMusicUrl.trim()||'';
    const ctx=`${phraseText} ${subject} ${genre} ${customGenre} ${musicLabel}`.toLowerCase();
    const stopWords=new Set(['DE','LA','EL','LOS','LAS','EN','Y','A','QUE','ES','UN','UNA','POR','CON','NO','SE','SU','PARA','AL','DEL','COMO','MAS','MÁS','PERO','SUS','LE','YA','O','ESTE','SI','SÍ','PORQUE','ESTA','ENTRE','CUANDO','MUY','SIN','SOBRE','TAMBIEN','ME','HASTA','HAY','DONDE','QUIEN','DESDE','TODO','NOS','DURANTE','TODOS','UNO','LES','NI','CONTRA','OTROS','ESE','ESO','ANTE','ELLOS','E','ESTO','MI','ANTES','ALGUNOS','QUE','unos','YO','OTRO','OTRA','ALGO']);
    const emotionalBoost=new Set(['FELIZ','ESPECIAL','RECUERDA','ALGUIEN','VIDA','PAZ','ALMA','CORAZON','CORAZÓN','AMOR','LUZ','SUEÑO','NUEVO','DIA','DÍA','SIEMPRE','HOY','CALMA','ETERNO','MAGIA','VERDAD','LIBERTAD','MUNDO','HISTORIA','BOSQUE','CELTA']);

    if(['feliz','alguien','nuevo dia','nuevo día','especial','recuerda','paz','alma','corazon','corazón','vida','amor','esperanza','sueño','calma','gratitud','luz','silencio','respir','abraza','sonr','naturaleza'].some(k=>ctx.includes(k))){
      return {
        id:'poetic_reflective',
        badge:'✨ Poético / Reflexivo · Cormorant Garamond Bold + Playfair Italic',
        primaryFont:"'Cormorant Garamond', Georgia, serif",
        accentFont:"'Playfair Display', Georgia, serif",
        accentItalic:true,
        highlightHex:'#FEEB98',
        ornament:'✦',
        stopWords,
        emotionalBoost
      };
    }
    if(['celta','campanilla','bosque','mistico','místico','historia','leyenda','antiguo','reino','sagrado','fe','dios','santa','madre teresa','catedral','imperio','misterio','mitologia','mitología','biografia','biografía'].some(k=>ctx.includes(k))){
      return {
        id:'epic_cinzel',
        badge:'🏛️ Épico / Celta / Historia · Playfair Display Bold + Cinzel Imperial',
        primaryFont:"'Playfair Display', Georgia, serif",
        accentFont:"'Cinzel', Georgia, serif",
        accentItalic:false,
        highlightHex:'#F8DE88',
        ornament:'❖',
        stopWords,
        emotionalBoost
      };
    }
    if(['deporte','futbol','fútbol','gol','campeon','campeón','copa','mundial','periodismo','noticia','urgente','debate','politica','política','crisis','impacto','record','récord'].some(k=>ctx.includes(k))){
      return {
        id:'broadcast_impact',
        badge:'📺 Periodismo / Deportes · Montserrat SemiBold + Oswald Bold Condensed',
        primaryFont:"'Montserrat', sans-serif",
        accentFont:"'Oswald', sans-serif",
        accentItalic:false,
        highlightHex:'#38BDF8',
        ornament:'━',
        stopWords,
        emotionalBoost
      };
    }
    if(['humor','risa','comedia','divertido','sketch','ironia','ironía','fiesta','energia','energía','rock','pop'].some(k=>ctx.includes(k))){
      return {
        id:'modern_dynamic',
        badge:'🔥 Moderno / Dinámico · Montserrat SemiBold + Montserrat Black',
        primaryFont:"'Montserrat', sans-serif",
        accentFont:"'Montserrat', sans-serif",
        accentItalic:false,
        highlightHex:'#FBBF24',
        ornament:'•',
        stopWords,
        emotionalBoost
      };
    }
    return {
      id:'editorial_luxury',
      badge:'🎬 Editorial Luxury · Montserrat SemiBold + Playfair Display Bold',
      primaryFont:"'Montserrat', sans-serif",
      accentFont:"'Playfair Display', Georgia, serif",
      accentItalic:false,
      highlightHex:'#6EE7B7',
      ornament:'✦',
      stopWords,
      emotionalBoost
    };
  };

  const applyQuickPhrasePreset=(presetKind:'happy_day'|'celtic_nature'|'epic_legacy'|'auto_topic')=>{
    let text='';
    if(presetKind==='happy_day'){
      text='UN NUEVO DÍA ES UN DÍA MUY ESPECIAL...\nRECUERDA HACER ALGO POR ALGUIEN...\nRECUERDA SER FELIZ...\nLA PAZ COMIENZA EN TU CORAZÓN';
    }else if(presetKind==='celtic_nature'){
      text='DONDE EL VIENTO ABRAZA LOS BOSQUES ANTIGUOS...\nEL ALMA ENCUENTRA SU REFUGIO EN LA CALMA...\nESCUCHA LA MELODÍA PURA DE LA NATURALEZA...\nRESPIRA PROFUNDO Y DEJA QUE TODO FLUYA';
    }else if(presetKind==='epic_legacy'){
      text='CADA INSTANTE GUARDA UNA HISTORIA ETERNA...\nLA GRANDEZA NACE DE LOS PEQUEÑOS GESTOS...\nEL TIEMPO REVELA LA VERDAD DEL ESPÍRITU...\nUN LEGADO DE LUZ QUE NUNCA SE APAGA';
    }else{
      const cleanSubj=(subject.trim()||uploadedFileLabels[alacarteMusicUrl.trim()]||'este nuevo día').replace(/\.[a-z0-9]{2,4}$/i,'');
      text=`${cleanSubj.toUpperCase()} NOS INVITA A DETENERNOS...\nCADA IMAGEN GUARDA UNA EMOCIÓN PROFUNDA...\nRECUERDA COMPARTIR LO MEJOR DE TI HOY...\nRECUERDA SER FELIZ EN CADA MOMENTO`;
    }
    setScreenMessage(text);
    setPreviewCutIdx(0);
    if(zocaloMode==='clean_none')setZocaloMode('floating_text');
  };

  const renderLiveScreenMessagePreview=()=>{
    const hasCustom=Boolean(screenMessage.trim());
    const clauses=splitScreenMessageClauses(screenMessage);
    const safeIdx=previewCutIdx%clauses.length;
    const activeClause=(clauses[safeIdx]||'').toUpperCase();
    const arch=detectLiveTypographyArchetype(activeClause);
    const words=activeClause.split(/\s+/).filter(Boolean);
    const mid=words.length>3?Math.ceil(words.length/2):words.length;
    const lines=words.length>3?[words.slice(0,mid),words.slice(mid)]:[words];

    return (
      <div style={{marginTop:10}}>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;800&family=Cormorant+Garamond:ital,wght@0,700;1,700&family=Montserrat:wght@600;800;900&family=Oswald:wght@700&family=Playfair+Display:ital,wght@0,700;1,700&display=swap" />
        <style>{`@keyframes atlasPreviewFadeBreath { 0% { opacity: 0.12; transform: translateY(4px); } 18% { opacity: 1; transform: translateY(0px); } 76% { opacity: 1; transform: translateY(0px); } 100% { opacity: 0.12; transform: translateY(-3px); } }`}</style>
        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',marginBottom:8}}>
          <span style={{fontSize:11,fontWeight:800,color:'#0369a1'}}>🪄 Sugerir Frases con 1 Clic:</span>
          <button type="button" onClick={()=>applyQuickPhrasePreset('happy_day')} style={{background:'#f0f9ff',color:'#0369a1',border:'1px solid #7dd3fc',borderRadius:8,padding:'4px 9px',fontSize:11,fontWeight:750,cursor:'pointer'}}>
            ✨ Día Especial / Ser Feliz
          </button>
          <button type="button" onClick={()=>applyQuickPhrasePreset('celtic_nature')} style={{background:'#ecfdf5',color:'#047857',border:'1px solid #6ee7b7',borderRadius:8,padding:'4px 9px',fontSize:11,fontWeight:750,cursor:'pointer'}}>
            🌿 Paz / Naturaleza / Celta
          </button>
          <button type="button" onClick={()=>applyQuickPhrasePreset('epic_legacy')} style={{background:'#fef3c7',color:'#92400e',border:'1px solid #fcd34d',borderRadius:8,padding:'4px 9px',fontSize:11,fontWeight:750,cursor:'pointer'}}>
            🏛️ Legado / Historia Épica
          </button>
          <button type="button" onClick={()=>applyQuickPhrasePreset('auto_topic')} style={{background:'#f5f3ff',color:'#6d28d9',border:'1px solid #c4b5fd',borderRadius:8,padding:'4px 9px',fontSize:11,fontWeight:750,cursor:'pointer'}}>
            🎯 Auto-Frases según tu Título
          </button>
        </div>

        {(hasCustom || zocaloMode !== 'clean_none') && (
          <div style={{background:'linear-gradient(180deg, rgba(15,23,42,0.92) 0%, rgba(7,12,24,0.98) 100%)',borderRadius:14,padding:'14px 16px',border:'1px solid #334155',boxShadow:'0 10px 28px rgba(15,23,42,0.22)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,marginBottom:10}}>
              <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                <span style={{fontSize:10.5,fontWeight:800,background:'rgba(56,189,248,0.16)',color:'#7dd3fc',border:'1px solid rgba(56,189,248,0.35)',borderRadius:6,padding:'2px 8px'}}>
                  👁️ VISTA PREVIA EN VIVO (2x Supersampled)
                </span>
                <span style={{fontSize:11,fontWeight:750,color:'#e2e8f0'}}>
                  {arch.badge}
                </span>
              </div>
              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                {clauses.map((_,idx)=>(
                  <button
                    key={idx}
                    type="button"
                    onClick={()=>setPreviewCutIdx(idx)}
                    style={{
                      background:safeIdx===idx?arch.highlightHex:'rgba(255,255,255,0.08)',
                      color:safeIdx===idx?'#0f172a':'#cbd5e1',
                      border:safeIdx===idx?`1px solid ${arch.highlightHex}`:'1px solid rgba(255,255,255,0.18)',
                      borderRadius:6,
                      padding:'3px 8px',
                      fontSize:10.5,
                      fontWeight:800,
                      cursor:'pointer'
                    }}
                  >
                    Corte #{idx+1} ({idx*5}s–{(idx+1)*5}s)
                  </button>
                ))}
              </div>
            </div>

            <div key={`${safeIdx}-${activeClause}`} style={{textAlign:'center',padding:'12px 10px 8px',animation:'atlasPreviewFadeBreath 4.8s ease-in-out infinite'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,marginBottom:8,opacity:0.85}}>
                <span style={{width:56,height:1.5,background:arch.highlightHex,display:'inline-block'}} />
                <span style={{color:arch.highlightHex,fontSize:14}}>{arch.ornament}</span>
                <span style={{width:56,height:1.5,background:arch.highlightHex,display:'inline-block'}} />
              </div>
              {lines.map((lineWords,lIdx)=>(
                <div key={lIdx} style={{lineHeight:1.25,marginBottom:4,textShadow:'0 4px 16px rgba(0,0,0,0.85)'}}>
                  {lineWords.map((w,wIdx)=>{
                    const cleanW=w.replace(/[.,;:!?'"«»()]/g,'');
                    const isLastWord=(lIdx===lines.length-1 && wIdx===lineWords.length-1 && lineWords.length>=2);
                    const isEmph=(!arch.stopWords.has(cleanW) && (arch.emotionalBoost.has(cleanW) || cleanW.length>=6 || isLastWord));
                    return (
                      <span
                        key={wIdx}
                        style={{
                          fontFamily:isEmph?arch.accentFont:arch.primaryFont,
                          fontStyle:(isEmph && arch.accentItalic)?'italic':'normal',
                          fontWeight:isEmph?700:600,
                          fontSize:isEmph?27:23,
                          letterSpacing:'0.06em',
                          color:isEmph?arch.highlightHex:'#FCFCFF',
                          marginRight:wIdx<lineWords.length-1?9:0
                        }}
                      >
                        {w}
                      </span>
                    );
                  })}
                </div>
              ))}
              <div style={{fontSize:10.5,color:'#94a3b8',marginTop:8}}>
                ✨ Así aparece y desaparece suavemente en el corte #{safeIdx+1} (sin bordes duros, con degradado atmosférico invisible).
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const lastLiveProgressSigRef=React.useRef<string>('');
  const computeLiveMissionProgress=(m:any,extraTickSec=0)=>{
    const stageStr=String(m?.stage||m?.status||'').toUpperCase();
    const detailStr=String(m?.detail||'');
    if(m?.status==='COMPLETE'||stageStr==='COMPLETE'){
      return {pct:100,remSec:0,stepIdx:6,isStalled:false,staleMin:0,steps:['1. Voz IA','2. Música','3. Videos','4. Render','5. QA 0 Freezes','6. Subida MP4']};
    }
    const staleSec=m?.updatedAt?Math.max(0,Math.floor((Date.now()-new Date(m.updatedAt).getTime())/1000)):0;
    const isStalled=staleSec>=540;
    const staleMin=Math.floor(staleSec/60);
    const ratioMatch=detailStr.match(/\((\d+)\s*\/\s*(\d+)\)/);
    const doneNum=ratioMatch?Number(ratioMatch[1]):0;
    const totalNum=ratioMatch?Math.max(1,Number(ratioMatch[2])):0;
    const actMatch=detailStr.match(/\bActo\s+(\d+)\s*\/\s*(\d+)/i);
    const actDone=actMatch?Number(actMatch[1]):0;
    const actTotal=actMatch?Math.max(1,Number(actMatch[2])):0;
    const cutLabel=totalNum>12?`4. Render ${totalNum} Cortes`:'4. Render 12 Cortes';
    const steps=['1. Voz IA','2. Música','3. Videos + Gate',cutLabel,'5. QA 0 Freezes','6. Subida MP4'];

    let pct=Number(m?.progressPct||12);
    let stepIdx=Number(m?.stepIndex||1);
    let remSec=Number(m?.estimatedRemainingSeconds??210);

    if(stageStr.includes('STAGE_6')||stageStr.includes('UPLOAD')||stageStr.includes('SHARD')){
      stepIdx=6;
      pct=ratioMatch?Math.min(99,95+Math.round((doneNum/totalNum)*4)):97;
      remSec=12;
    }else if(stageStr.includes('STAGE_5')||stageStr.includes('TECHNICAL_QA')){
      stepIdx=5;
      pct=93;
      remSec=28;
    }else if(stageStr.includes('STAGE_4')||stageStr.includes('RENDER')){
      stepIdx=4;
      if(actMatch){
        pct=84+Math.round((actDone/actTotal)*8);
        remSec=Math.max(30,(actTotal-actDone+1)*35);
      }else if(ratioMatch){
        pct=54+Math.round((doneNum/totalNum)*30);
        remSec=Math.max(45,Math.round((totalNum-doneNum)*3.2)+60);
      }else{
        pct=Math.max(54,pct);
      }
    }else if(stageStr.includes('STAGE_3_5')||stageStr.includes('PRE_RENDER')){
      stepIdx=3;
      pct=52;
      remSec=totalNum>30?280:140;
    }else if(stageStr.includes('STAGE_3')||stageStr.includes('SOURCES')||stageStr.includes('YOUTUBE')){
      stepIdx=3;
      if(ratioMatch){
        pct=24+Math.round((doneNum/totalNum)*27);
        remSec=Math.max(90,Math.round((totalNum-doneNum)*4.5)+180);
      }else{
        pct=Math.max(24,Math.min(34,pct));
      }
    }else if(stageStr.includes('STAGE_2')||stageStr.includes('MUSIC')){
      stepIdx=2;
      pct=Math.max(18,Math.min(23,pct));
    }else if(stageStr.includes('STAGE_1')||stageStr.includes('PIPER')){
      stepIdx=1;
      pct=Math.max(10,Math.min(17,pct));
    }

    if(!isStalled&&extraTickSec>0){
      pct=Math.min(98,pct+Math.min(7,Math.floor(extraTickSec/20)));
      remSec=Math.max(6,remSec-extraTickSec);
    }else{
      pct=Math.min(98,pct);
    }
    return {pct,remSec,stepIdx,isStalled,staleMin,steps};
  };

  const liveRunningMission=(activeAutoMissions.find((m:any)=>m.status!=='COMPLETE'&&m.status!=='FAILED')||null)||
    (dispatch&&dispatch.status==='RUNNING'?activeAutoMissions.find((m:any)=>m.missionId?.startsWith(dispatch.id))||{
      missionId:dispatch.id,
      title:subject||script.split(/\r?\n/)[0]?.slice(0,60)||'Producción en curso',
      genre,
      stage:'STAGE_1_PIPER_VOICES',
      detail:dispatch.blocker||'Iniciando producción en Google Colab…',
      progressPct:submitting?8:15,
      estimatedRemainingSeconds:210,
      stepIndex:1
    }:null);

  useEffect(()=>{
    if(!liveRunningMission)return;
    const t=setInterval(()=>setTickSec(x=>x+1),1000);
    return()=>clearInterval(t);
  },[Boolean(liveRunningMission)]);

  const loadFactoryLearningAndDeliveries=async(onlyIfEmpty=false)=>{
    try{
      const {data}=await supabase.auth.getSession();
      const headers:Record<string,string>=data?.session?.access_token?{Authorization:'Bearer '+data.session.access_token}:{};
      const res=await fetch('/api/user/atlas-video-missions/factory-requests/learning-summary',{
        cache:'no-store',headers,signal:AbortSignal.timeout(12000)});
      if(!res.ok)return;
      const json=await res.json();
      if(json.summary)setLearningSummary(json.summary);
      if(Array.isArray(json.activeAutoMissions)){
        setActiveAutoMissions(json.activeAutoMissions);
        const topRun=json.activeAutoMissions.find((x:any)=>x.status!=='COMPLETE'&&x.status!=='FAILED');
        const sig=topRun?`${topRun.missionId}|${topRun.stage||''}|${topRun.detail||''}|${topRun.updatedAt||''}`:'';
        if(sig!==lastLiveProgressSigRef.current){
          lastLiveProgressSigRef.current=sig;
          setTickSec(0);
        }
        setDispatch(prev=>{
          if(!prev)return prev;
          const m=json.activeAutoMissions.find((x:any)=>x.missionId===prev.id||String(x.missionId||'').startsWith(prev.id));
          if(!m)return prev;
          if(m.stage==='COMPLETE'){
            return {...prev,status:'DELIVERED_REVIEW_PENDING',productionStarted:true,videoUrl:m.signedVideoUrl||prev.videoUrl,blocker:'✅ Video terminado automáticamente en Google Colab (0 congelaciones) y cargado en el Reproductor.'};
          }
          return {...prev,status:'RUNNING',productionStarted:true,blocker:'🎬 En producción automática en Google Colab: '+m.stage+(m.detail?' — '+m.detail:'')};
        });
      }
      if(Array.isArray(json.deliveries)&&json.deliveries.length){
        const partMap=new Map<string,any>();
        const shardMap=new Map<string,Record<number,any>>();
        for(const d of json.deliveries){
          const m=String(d.id||'').match(/^(.+)__part(2|3)$/);
          if(m){
            const curP=partMap.get(m[1])||{};
            curP[`part${m[2]}`]=d;
            partMap.set(m[1],curP);
          }
          const ms=String(d.id||'').match(/^(.+)__shard(\d+)$/);
          if(ms){
            const sObj=shardMap.get(ms[1])||{};
            sObj[Number(ms[2])]=d;
            shardMap.set(ms[1],sObj);
          }
        }
        const mergedDeliveries=json.deliveries
          .filter((d:any)=>!/__(part(2|3)|shard\d+)$/.test(String(d.id||'')))
          .map((d:any)=>{
            const shComp=shardMap.get(d.id);
            if(shComp){
              const keys=Object.keys(shComp).map(Number).sort((a,b)=>a-b);
              const extraShards=keys.map(k=>shComp[k]);
              const pointerShardUrls=[d.signedVideoUrl,...extraShards.map((s:any)=>s?.signedVideoUrl)].filter(Boolean);
              const totalShardBytes=Number(d.bytes||0)+extraShards.reduce((acc:number,s:any)=>acc+Number(s?.bytes||0),0);
              return {
                ...d,
                pointerShardUrls,
                pointerShardCompanions:extraShards.map((s:any)=>({id:s.id,sha256:s.sha256})),
                totalShardBytes
              };
            }
            const comp=partMap.get(d.id);
            if(!comp)return d;
            const p2=comp.part2,p3=comp.part3;
            const d1=Number(d.durationSeconds||0),d2=Number(p2?.durationSeconds||d.part2DurationSeconds||0),d3=Number(p3?.durationSeconds||d.part3DurationSeconds||0);
            return {
              ...d,
              signedVideoPart2Url:d.signedVideoPart2Url||p2?.signedVideoUrl||null,
              signedVideoPart3Url:d.signedVideoPart3Url||p3?.signedVideoUrl||null,
              part2Bytes:d.part2Bytes||p2?.bytes||null,
              part3Bytes:d.part3Bytes||p3?.bytes||null,
              part2Sha256:d.part2Sha256||p2?.sha256||null,
              part3Sha256:d.part3Sha256||p3?.sha256||null,
              totalThreePartsDurationSeconds:d.totalThreePartsDurationSeconds||(d1+d2+d3||null)
            };
          });
        setVerifiedDeliveries(prev=>{
          const prevIds=prev.map((x:any)=>`${x.id}:${x.sha256||''}:${x.part3Sha256||''}`).join(',');
          const nextIds=mergedDeliveries.map((x:any)=>`${x.id}:${x.sha256||''}:${x.part3Sha256||''}`).join(',');
          if(!onlyIfEmpty||prev.length===0||prevIds!==nextIds){
            const current=mergedDeliveries[0];
            if(current){
              setSelectedDeliveryId(current.id);
              if(typeof current.signedVideoUrl==='string')setActiveVideoUrl(current.signedVideoUrl);
              if(typeof current.signedCreditsUrl==='string')setActiveCreditsUrl(current.signedCreditsUrl);
              setActiveContactSheetUrl(typeof current.signedContactSheetUrl==='string'?current.signedContactSheetUrl:null);
            }
          }
          return mergedDeliveries;
        });
      }
    }catch{/* Non-blocking read-only summary */}
  };

  useEffect(()=>{
    try{const savedKey=localStorage.getItem('atlas_elevenlabs_api_key');if(savedKey)setElevenApiKey(savedKey);}catch{}
    void loadFactoryLearningAndDeliveries(false);
    const t=setInterval(()=>{
      if(document.visibilityState==='visible')void loadFactoryLearningAndDeliveries(true);
    },4500);
    return()=>clearInterval(t);
  },[]);

  const renewAndPlayCloudDelivery=async(deliveryId:string)=>{
    if(submitting)return;
    const item=verifiedDeliveries.find(d=>d.id===deliveryId);
    if(!item)return;
    setSelectedDeliveryId(item.id);
    setActivePartIdx(1);
    setAutoAdvancePart(false);
    setLiveVideoMeta(null);
    if(item.signedVideoUrl)setActiveVideoUrl(item.signedVideoUrl);
    if(item.signedCreditsUrl)setActiveCreditsUrl(item.signedCreditsUrl);
    setActiveContactSheetUrl(item.signedContactSheetUrl||null);
    setSubmitting(true);setFeedbackStatus('Renovando enlace privado de lectura (sin re-renderizar)…');
    try{
      const {data}=await supabase.auth.getSession();
      const headers:Record<string,string>={'Content-Type':'application/json'};
      if(data?.session?.access_token)headers.Authorization='Bearer '+data.session.access_token;
      const res=await fetch('/api/user/atlas-video-missions/factory-requests/renew-signed-url',{
        method:'POST',cache:'no-store',headers,
        body:JSON.stringify({deliveryId:item.id,expectedSha256:item.sha256}),signal:AbortSignal.timeout(12000)});
      const json=await res.json();
      if(!res.ok)throw Error(json.error||'No se pudo renovar el enlace.');
      if(json.signedVideoUrl){
        setActiveVideoUrl(json.signedVideoUrl);
        setDispatch(prev=>prev&&prev.status==='DELIVERED_REVIEW_PENDING'?{...prev,videoUrl:json.signedVideoUrl}:prev);
      }
      if(json.signedVideoUrl&&Array.isArray(item.pointerShardCompanions)&&item.pointerShardCompanions.length>0){
        const renewedExtras=await Promise.all(item.pointerShardCompanions.map(async(sc:any,idx:number)=>{
          try{
            const rs=await fetch('/api/user/atlas-video-missions/factory-requests/renew-signed-url',{
              method:'POST',cache:'no-store',headers,
              body:JSON.stringify({deliveryId:sc.id,expectedSha256:sc.sha256}),signal:AbortSignal.timeout(10000)});
            const js=await rs.json();
            if(rs.ok&&js.signedVideoUrl)return js.signedVideoUrl;
          }catch{}
          return item.pointerShardUrls?.[idx+1]||null;
        }));
        const nextShardUrls=[json.signedVideoUrl,...renewedExtras].filter(Boolean);
        setVerifiedDeliveries(prev=>prev.map(d=>d.id===item.id?{...d,pointerShardUrls:nextShardUrls}:d));
      }
      let p2Signed=json.signedVideoPart2Url||null;
      let p3Signed=json.signedVideoPart3Url||null;
      if(!p2Signed&&item.part2Sha256){
        try{
          const r2=await fetch('/api/user/atlas-video-missions/factory-requests/renew-signed-url',{
            method:'POST',cache:'no-store',headers,
            body:JSON.stringify({deliveryId:`${item.id}__part2`,expectedSha256:item.part2Sha256}),signal:AbortSignal.timeout(10000)});
          const j2=await r2.json();
          if(r2.ok&&j2.signedVideoUrl)p2Signed=j2.signedVideoUrl;
        }catch{}
      }
      if(!p3Signed&&item.part3Sha256){
        try{
          const r3=await fetch('/api/user/atlas-video-missions/factory-requests/renew-signed-url',{
            method:'POST',cache:'no-store',headers,
            body:JSON.stringify({deliveryId:`${item.id}__part3`,expectedSha256:item.part3Sha256}),signal:AbortSignal.timeout(10000)});
          const j3=await r3.json();
          if(r3.ok&&j3.signedVideoUrl)p3Signed=j3.signedVideoUrl;
        }catch{}
      }
      if(p2Signed||p3Signed){
        setVerifiedDeliveries(prev=>prev.map(d=>d.id===item.id?{
          ...d,
          signedVideoPart2Url:p2Signed||d.signedVideoPart2Url,
          signedVideoPart3Url:p3Signed||d.signedVideoPart3Url
        }:d));
      }
      if(json.signedCreditsUrl)setActiveCreditsUrl(json.signedCreditsUrl);
      if(json.signedContactSheetUrl)setActiveContactSheetUrl(json.signedContactSheetUrl);
      setFeedbackStatus('Enlace privado activo (SHA verificado, 0 re-renders).');
    }catch(e){setFeedbackStatus(e instanceof Error?e.message:'Usando último enlace disponible.');}
    finally{setSubmitting(false);}
  };

  const toggleSideBySideCompare=async()=>{
    if(compareSideBySide){
      setCompareSideBySide(false);
      return;
    }
    setCompareSideBySide(true);
    const cur=verifiedDeliveries.find((d:any)=>d.id===selectedDeliveryId)||verifiedDeliveries[0];
    let origCandidate=verifiedDeliveries.find((d:any)=>d.id==='f_demo_zocalos_material_you_20s_v2'&&d.id!==cur?.id)||
      verifiedDeliveries.find((d:any)=>d.id!==cur?.id && !/remaster|4k|2160/i.test(`${d.id} ${d.title}`))||
      verifiedDeliveries.find((d:any)=>d.id!==cur?.id);
    if(origCandidate){
      setCompareOriginalId(origCandidate.id);
      setCompareOriginalMeta(null);
      setCompareOriginalUrl(origCandidate.signedVideoUrl||null);
      try{
        const {data}=await supabase.auth.getSession();
        const headers:Record<string,string>={'Content-Type':'application/json'};
        if(data?.session?.access_token)headers.Authorization='Bearer '+data.session.access_token;
        const res=await fetch('/api/user/atlas-video-missions/factory-requests/renew-signed-url',{
          method:'POST',cache:'no-store',headers,
          body:JSON.stringify({deliveryId:origCandidate.id,expectedSha256:origCandidate.sha256}),signal:AbortSignal.timeout(12000)});
        const json=await res.json();
        if(res.ok&&json.signedVideoUrl)setCompareOriginalUrl(json.signedVideoUrl);
      }catch{}
    }
  };

  const changeCompareOriginal=async(origId:string)=>{
    setCompareOriginalId(origId);
    setCompareOriginalMeta(null);
    const origCandidate=verifiedDeliveries.find((d:any)=>d.id===origId);
    if(!origCandidate)return;
    setCompareOriginalUrl(origCandidate.signedVideoUrl||null);
    try{
      const {data}=await supabase.auth.getSession();
      const headers:Record<string,string>={'Content-Type':'application/json'};
      if(data?.session?.access_token)headers.Authorization='Bearer '+data.session.access_token;
      const res=await fetch('/api/user/atlas-video-missions/factory-requests/renew-signed-url',{
        method:'POST',cache:'no-store',headers,
        body:JSON.stringify({deliveryId:origCandidate.id,expectedSha256:origCandidate.sha256}),signal:AbortSignal.timeout(12000)});
      const json=await res.json();
      if(res.ok&&json.signedVideoUrl)setCompareOriginalUrl(json.signedVideoUrl);
    }catch{}
  };

  const remasterCloudDelivery=async(deliveryId:string, tier:'1080p'|'4k'='1080p')=>{
    if(submitting)return;
    const item=verifiedDeliveries.find(d=>d.id===deliveryId)||verifiedDeliveries[0];
    if(!item)return;
    const is4k = tier === '4k';
    const labelRes = is4k ? '4K Ultra HD (2160p)' : 'Full HD 1080p';
    const tagPrefix = is4k ? '[REMASTERIZAR_4K]' : '[REMASTERIZAR_HD]';
    setSubmitting(true);
    setFeedbackStatus(`⏳ Preparando remasterización ${labelRes} de "${item.title || item.id}"…`);
    try{
      const {data}=await supabase.auth.getSession();
      const headers:Record<string,string>={'Content-Type':'application/json'};
      if(data?.session?.access_token&&!data.session.user?.is_anonymous){
        headers.Authorization='Bearer '+data.session.access_token;
      }
      let freshUrl=item.signedVideoUrl||activeVideoUrl||'';
      try{
        const ren=await fetch('/api/user/atlas-video-missions/factory-requests/renew-signed-url',{
          method:'POST',cache:'no-store',headers,
          body:JSON.stringify({deliveryId:item.id,expectedSha256:item.sha256}),signal:AbortSignal.timeout(12000)});
        const renJson=await ren.json();
        if(ren.ok&&renJson.signedVideoUrl){
          freshUrl=renJson.signedVideoUrl;
          setActiveVideoUrl(renJson.signedVideoUrl);
        }
      }catch{}
      if(!freshUrl)throw Error('No se pudo obtener el enlace privado del video para remasterizar.');
      const cleanTitle=String(item.title||item.id).split(' · ')[0].replace(/^\[[^\]]+\]\s*/g,'').replace(/\s*\(Remasterizado[^)]*\)\s*/gi,' ').trim()||'Video Remasterizado';
      const durSec=Math.max(10,Math.min(600,Math.round(Number(item.durationSeconds)||60)));
      const isHoriz=/1280x720|1920x1080|3840x2160|horizontal/i.test(`${item.title||''} ${item.size||''} ${item.id||''}`);
      const fmt:Format=isHoriz?'horizontal':'vertical';
      const dimLabel = is4k ? (isHoriz ? '3840x2160' : '2160x3840') : (isHoriz ? '1920x1080' : '1080x1920');
      const nextRefs = [freshUrl];
      setSubject(`${cleanTitle} (Remasterizado ${labelRes})`);
      setSeconds(String(durSec));
      setFormat(fmt);
      setVideoMixMode(is4k ? 'remaster_4k' : 'remaster');
      setReferences(nextRefs.join('\n'));
      setUploadedFileLabels(prev=>({...prev,[freshUrl]:`${item.id}.mp4`}));
      const reqBody:VideoRequest={
        schema:'ATLAS_VIDEO_FACTORY_REQUEST_V1',
        genre:item.genre||'Documental',
        subject:`[FX:auto] [ZOCALO:smart_full] [REMASTER_SOURCE_ID:${item.id}] [VOZ_ID:${selectedElevenVoiceId}] ${tagPrefix} ${cleanTitle} (Remasterizado ${labelRes})`,
        durationSeconds:durSec,
        quantity:1,
        format:fmt,
        script:'',
        references:nextRefs,
        rules:{existingFirst:true,cloudFirst:true,noPaidApis:true,noPublication:true,requireRealEvidenceForFacts:true,finalHumanApproval:true},
        status:'PREPARED_NOT_DISPATCHED'
      };
      const createRes=await fetch('/api/user/atlas-video-missions/factory-requests',{
        method:'POST',cache:'no-store',headers,body:JSON.stringify(reqBody),signal:AbortSignal.timeout(15000)});
      const receipt=await createRes.json();
      if(!createRes.ok||!receipt?.id)throw Error(receipt?.error||'No se pudo registrar la misión de remasterización.');
      setDispatch({...(receipt as FactoryReceipt),status:'RUNNING',blocker:`✨ Encolando Remasterización ${labelRes} (Lanczos + CAS + hqdn3d + afftdn) en Google Colab…`});
      const autoRes=await fetch('/api/user/atlas-video-missions/factory-requests/'+encodeURIComponent(receipt.id)+'/auto-produce',{
        method:'POST',cache:'no-store',headers,signal:AbortSignal.timeout(45000)});
      const autoJson=await autoRes.json();
      if(!autoRes.ok)throw Error(autoJson?.error||'No se pudo iniciar la remasterización en Colab.');
      setFeedbackStatus(`✅ ¡Encolado en Google Colab! Remasterizando "${cleanTitle}" a ${labelRes} (${dimLabel}) y limpiando congelamientos + audio.`);
      setMessage(`✨ Misión ${receipt.id}: Remasterizando "${cleanTitle}" a ${labelRes} en Google Colab ($0.00)…`);
      await loadFactoryLearningAndDeliveries(false);
    }catch(e){
      setFeedbackStatus('❌ '+(e instanceof Error?e.message:'No se pudo iniciar la remasterización.'));
    }finally{
      setSubmitting(false);
    }
  };

  const submitDirectorFeedback=async(verdict:string,defaultText:string)=>{
    if(submitting)return;
    const item=verifiedDeliveries.find(d=>d.id===selectedDeliveryId)||verifiedDeliveries[0];
    if(!item)return;
    setSubmitting(true);setFeedbackStatus('Guardando evaluación en memoria del Director…');
    try{
      const {data,error}=await supabase.auth.getSession();
      if(error||!data.session||data.session.user.is_anonymous)throw Error('Iniciá sesión en YOUAPP.');
      const res=await fetch('/api/user/atlas-video-missions/factory-requests/director-feedback',{
        method:'POST',cache:'no-store',
        headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},
        body:JSON.stringify({
          deliveryId:item.id,
          filmTitle:item.title,
          sha256:item.sha256,
          verdict,
          feedback:(directorNote.trim()||defaultText)
        }),signal:AbortSignal.timeout(12000)});
      const json=await res.json();
      if(!res.ok)throw Error(json.error||'No se pudo registrar la evaluación.');
      setDirectorNote('');
      setFeedbackStatus('Aprendizaje registrado: '+json.record.verdict+' ('+json.record.id+'). No inició render.');
      await loadFactoryLearningAndDeliveries();
    }catch(e){setFeedbackStatus(e instanceof Error?e.message:'No se pudo guardar.');}
    finally{setSubmitting(false);}
  };

  const parsedVideoUrls=Array.from(new Set(
    references.split(/[\r\n,\s]+/).map(v=>v.trim()).filter(v=>/^https?:\/\//i.test(v))
  ));

  const addVideoUrlToList=()=>{
    const incoming=newVideoUrl.split(/[\r\n,\s]+/).map(v=>v.trim()).filter(v=>/^https?:\/\//i.test(v));
    if(!incoming.length)return;
    const merged=Array.from(new Set([...parsedVideoUrls,...incoming])).slice(0,20);
    setReferences(merged.join('\n'));
    setNewVideoUrl('');
  };

  const removeVideoUrlFromList=(targetUrl:string)=>{
    const nextList=parsedVideoUrls.filter(u=>u!==targetUrl);
    setReferences(nextList.join('\n'));
  };

  const parsedAlacarteVisualUrls=Array.from(new Set(
    alacarteVisualUrls.split(/[\r\n,\s]+/).map(v=>v.trim()).filter(v=>/^https?:\/\//i.test(v))
  ));

  const addAlacarteVisualUrlToList=()=>{
    const incoming=newAlacarteVisualUrl.split(/[\r\n,\s]+/).map(v=>v.trim()).filter(v=>/^https?:\/\//i.test(v));
    if(!incoming.length)return;
    const merged=Array.from(new Set([...parsedAlacarteVisualUrls,...incoming])).slice(0,20);
    setAlacarteVisualUrls(merged.join('\n'));
    setNewAlacarteVisualUrl('');
  };

  const removeAlacarteVisualUrlFromList=(targetUrl:string)=>{
    const nextList=parsedAlacarteVisualUrls.filter(u=>u!==targetUrl);
    setAlacarteVisualUrls(nextList.join('\n'));
  };

  const moveAlacarteVisualUrl=(idx:number,dir:-1|1)=>{
    const targetIdx=idx+dir;
    if(targetIdx<0||targetIdx>=parsedAlacarteVisualUrls.length)return;
    const copy=[...parsedAlacarteVisualUrls];
    const tmp=copy[idx];
    copy[idx]=copy[targetIdx];
    copy[targetIdx]=tmp;
    setAlacarteVisualUrls(copy.join('\n'));
  };

  const autoSortFlowVisualCards=()=>{
    if(parsedAlacarteVisualUrls.length<=1)return;
    const scoreCard=(u:string,idx:number)=>{
      const label=(uploadedFileLabels[u]||u).toLowerCase();
      if(/\b(intro|apertura|inicio|amanecer|alba|opening|start|escena[_\s-]*0*1|scene[_\s-]*0*1|clip[_\s-]*0*1|parte[_\s-]*0*1)\b/i.test(label))return -1000+idx;
      if(/\b(final|cierre|outro|ending|atardecer|noche|sunset|escena[_\s-]*0*(6|7|8|9|10|11|12)|scene[_\s-]*0*(6|7|8|9|10|11|12))\b/i.test(label))return 1000+idx;
      const numMatch=label.match(/(?:escena|scene|clip|card|tarjeta|parte|part|video|v|c|#|[_\s-])0*(\d{1,3})\b/i)||label.match(/(\d{1,3})/);
      if(numMatch)return parseInt(numMatch[1],10);
      return 500+idx;
    };
    const sorted=[...parsedAlacarteVisualUrls].sort((a,b)=>{
      const sa=scoreCard(a,parsedAlacarteVisualUrls.indexOf(a));
      const sb=scoreCard(b,parsedAlacarteVisualUrls.indexOf(b));
      if(sa!==sb)return sa-sb;
      return (uploadedFileLabels[a]||a).localeCompare(uploadedFileLabels[b]||b,undefined,{numeric:true,sensitivity:'base'});
    });
    setAlacarteVisualUrls(sorted.join('\n'));
    setUploadStatusMsg(`✅ ¡Listo! ATLAS ordenó tus ${sorted.length} tarjetas de video en secuencia cinematográfica (Escena #1 → #${sorted.length}).`);
  };

  const handleExtractScriptFromUrl=async()=>{
    const targetUrl=alacarteScriptUrl.trim();
    if(!/^https?:\/\//i.test(targetUrl)){
      setExtractScriptStatus('❌ Pegá primero una URL válida (ej. un link de YouTube) en la casilla de Guion.');
      return;
    }
    setExtractingScript(true);
    setExtractScriptStatus('⏳ Extrayendo el guion de la URL (sin su voz original) en 6 bloques de 10s…');
    try{
      const {data}=await supabase.auth.getSession();
      const authHeaders:Record<string,string>={'Content-Type':'application/json'};
      if(data?.session?.access_token&&!data.session.user?.is_anonymous){
        authHeaders.Authorization='Bearer '+data.session.access_token;
      }
      const res=await fetch('/api/user/atlas-video-missions/factory-requests/extract-script',{
        method:'POST',cache:'no-store',headers:authHeaders,
        body:JSON.stringify({url:targetUrl,genre:genre==='Otro'?customGenre:genre,subject}),
        signal:AbortSignal.timeout(25000)
      });
      const json=await res.json();
      if(!res.ok)throw Error(json.error||'No se pudo extraer el guion de esa URL.');
      if(typeof json.plainScriptText==='string'&&json.plainScriptText.trim()){
        setScript(json.plainScriptText.trim());
      }
      if(!subject.trim()&&typeof json.extractedTitle==='string'&&json.extractedTitle.trim()){
        setSubject(json.extractedTitle.trim());
      }
      setAlacarteNoVoice(true);
      setExtractScriptStatus('✅ ¡Guion extraído sin voz y cargado en el Punto 3! Quedó activado "SIN VOZ (la voz después la ponemos nosotros)".');
    }catch(e){
      setExtractScriptStatus('❌ '+(e instanceof Error?e.message:'Error al extraer el guion.'));
    }finally{
      setExtractingScript(false);
    }
  };

  const handleGenerateVeoFlowPrompts = async () => {
    setGeneratingVeo(true);
    setVeoStatus('⏳ Generando los 6 prompts cinematográficos para Google Flow / Veo 3 y Whisk…');
    try {
      const {data}=await supabase.auth.getSession();
      const authHeaders:Record<string,string>={'Content-Type':'application/json'};
      if(data?.session?.access_token&&!data.session.user?.is_anonymous){
        authHeaders.Authorization='Bearer '+data.session.access_token;
      }
      const actualGenre = genre==='Otro' ? customGenre.trim() : genre;
      const res=await fetch('/api/user/atlas-video-missions/factory-requests/veo-flow-prompts',{
        method:'POST',cache:'no-store',headers:authHeaders,
        body:JSON.stringify({subject:subject.trim()||'Documental Cinematográfico',script:script.trim(),genre:actualGenre,format})
      });
      const json=await res.json();
      if(!res.ok)throw Error(json.error||'No se pudieron generar los prompts para Veo 3 / Flow.');
      if(Array.isArray(json.prompts)){
        setVeoPrompts(json.prompts);
        setVeoStatus(`✅ ¡Listos los ${json.prompts.length} prompts cinematográficos para Google Flow / Veo 3 (${format==='vertical'?'9:16 Vertical':'16:9 Horizontal'})!`);
      }
    } catch(e) {
      setVeoStatus('❌ '+(e instanceof Error?e.message:'Error generando prompts para Veo 3.'));
    } finally {
      setGeneratingVeo(false);
    }
  };

  const interpretPromptClientFallback = async (rawPrompt: string) => {
    const detectedFormat: 'vertical'|'horizontal'|'cuadrado' = /\b(horizontal|16\s*:\s*9|widescreen|cine|pantalla\s+ancha)\b/i.test(rawPrompt)
      ? 'horizontal'
      : (/\b(cuadrado|1\s*:\s*1|square)\b/i.test(rawPrompt) ? 'cuadrado' : 'vertical');
    const secMatch = rawPrompt.match(/\b(\d{2,3})\s*(?:s|seg|segundos)\b/i);
    const detectedSeconds = secMatch ? String(Math.max(15, Math.min(180, parseInt(secMatch[1], 10)))) : '60';
    let detectedGenre = 'Documental';
    if (/\b(deport|f[uú]tbol|boca|river|messi|selecci[oó]n|gol|campe[oó]n|partido|torneo|copa|liga)\b/i.test(rawPrompt)) detectedGenre = 'Informe deportivo';
    else if (/\b(humor|comedia|sketch|gracioso|chiste|parodia|risa)\b/i.test(rawPrompt)) detectedGenre = 'Humor / Comedia';
    else if (/\b(notic|period[ií]st|actualidad|informe|pol[ií]tic|econom[ií]a|urgente)\b/i.test(rawPrompt)) detectedGenre = 'Informe periodístico';
    else if (/\b(biograf[ií]a|vida\s+de|historia\s+de\s+vida)\b/i.test(rawPrompt)) detectedGenre = 'Biografía';
    else if (/\b(educat|explic|clase|aprender|ciencia|tutorial)\b/i.test(rawPrompt)) detectedGenre = 'Educativo';
    else if (/\b(publicid|comercial|spot|marca|anuncio)\b/i.test(rawPrompt)) detectedGenre = 'Publicidad';
    else if (/\b(videoclip|musical|canci[oó]n)\b/i.test(rawPrompt)) detectedGenre = 'Videoclip';

    let detectedVoiceId = 'JBFqnCBsd6RMkjVDRZzb';
    if (detectedGenre === 'Informe deportivo' || /\b(relator|din[aá]mico|charlie)\b/i.test(rawPrompt)) detectedVoiceId = 'IKne3meq5aSn9XLyUdCD';
    else if (detectedGenre === 'Informe periodístico' || /\b(periodista|noticiero|eric)\b/i.test(rawPrompt)) detectedVoiceId = 'cjVigY5qzO86Huf0OWal';
    else if (/\b(voz\s+femenina|mujer|conductora|sarah)\b/i.test(rawPrompt)) detectedVoiceId = 'EXAVITQu4vr4xnSDxMaL';
    else if (detectedGenre === 'Educativo' || /\b(docente|matilda)\b/i.test(rawPrompt)) detectedVoiceId = 'XrExE9yKIg1WjnnlVkGX';

    const detectedZocaloMode: 'smart_full'|'floating_text'|'music_pill'|'clean_none' =
      /\b(sin\s+z[oó]calo|limpio|sin\s+texto)\b/i.test(rawPrompt) ? 'clean_none' :
      (/\b(letras?\s+flotantes?|texto\s+flotante)\b/i.test(rawPrompt) ? 'floating_text' : 'smart_full');

    const rawUrlsInPrompt = Array.from(rawPrompt.matchAll(/https?:\/\/[^\s"'<>]+/gi)).map(m => m[0].trim());
    const isMusicUrlIntent = /\b(canci[oó]n|tema|m[uú]sica|soundtrack|rocky|audio|fondo\s+musical|todo\s+el\s+tema)\b/i.test(rawPrompt);
    let detectedCustomMusicUrl = '';
    if (rawUrlsInPrompt.length > 0 && isMusicUrlIntent) {
      const firstUrl = rawUrlsInPrompt[0];
      const ytMatch = firstUrl.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      detectedCustomMusicUrl = ytMatch && ytMatch[1]
        ? `https://www.youtube.com/watch?v=${ytMatch[1]}`
        : firstUrl;
    }

    const cleanedSubject = rawPrompt
      .replace(/https?:\/\/[^\s"'<>]+/gi, ' ')
      .replace(/^(?:bueno[,:\s]*|dale[,:\s]*|hola\s+atlas[,:\s]*|atlas[,:\s]*|por\s+favor[,:\s]*)*(?:haceme|hazme|hace|hacer|crea|creame|armame|arma|genera|generame|produc[ií]|quiero|necesito)\s+(?:un|una)?\s*(?:video|documental|informe\s+deportivo|informe\s+period[ií]stico|informe|biograf[ií]a|reel|short|pel[ií]cula|clip|resumen)?\s*(?:vertical|horizontal|cuadrado|en\s+4k|en\s+1080p|full\s+hd|hd|de\s+\d+\s*(?:s|seg|segundos))*\s*(?:sobre|de|acerca\s+de|del|de\s+la|de\s+los|de\s+las)?\s*/i, '')
      .replace(/\b(?:hazlo\s+emocional|hacelo\s+emocional|con\s+tema\s+de\s+[^,.]+|quiero\s+esta\s+canci[oó]n|todo\s+el\s+tema|con\s+esta\s+m[uú]sica|con\s+esta\s+canci[oó]n|con\s+voz\s+de\s+[^,.]+|con\s+z[oó]calos?\s+[^,.]+|en\s+formato\s+(?:vertical|horizontal|cuadrado)|de\s+\d+\s*(?:s|seg|segundos)|y\s+mandalo\s+a\s+producir|en\s+maxima\s+calidad|en\s+m[aá]xima\s+calidad)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim() || rawPrompt.replace(/https?:\/\/[^\s"'<>]+/gi, '').trim().slice(0, 80);

    let blocks: string[] = [];
    try {
      const sr = await fetch(`https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanedSubject)}&srlimit=1&format=json&origin=*`).then(r=>r.json());
      const topTitle = sr?.query?.search?.[0]?.title;
      if (topTitle) {
        const ex = await fetch(`https://es.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${encodeURIComponent(topTitle)}&format=json&origin=*`).then(r=>r.json());
        const page = Object.values(ex?.query?.pages || {})[0] as any;
        const rawExt = String(page?.extract || '');
        const sents = rawExt.split(/(?<=[.!?])\s+/).map(s=>s.replace(/\s+/g,' ').trim()).filter(s=>s.length>=38 && s.length<=165);
        blocks = sents.slice(0, 6);
      }
    } catch {}
    const fallbacks = [
      `Iniciamos este especial sobre ${cleanedSubject}, recorriendo sus momentos decisivos y su impacto real en la historia.`,
      `A través de imágenes documentales verificadas analizamos el contexto, las raíces y el desarrollo de ${cleanedSubject}.`,
      `Cada etapa de ${cleanedSubject} revela protagonistas fundamentales y transformaciones que marcaron una época.`,
      `Los registros visuales muestran en detalle la magnitud y trascendencia que alcanzó ${cleanedSubject}.`,
      `El análisis permite comprender por qué ${cleanedSubject} sigue despertando interés y admiración en la actualidad.`,
      `Así cerramos este recorrido especial en alta definición sobre el legado y la vigencia de ${cleanedSubject}.`
    ];
    while (blocks.length < 6) {
      blocks.push(fallbacks[blocks.length]);
    }
    return {
      genre: detectedGenre,
      subject: cleanedSubject,
      format: detectedFormat,
      seconds: detectedSeconds,
      voiceId: detectedVoiceId,
      zocaloMode: detectedZocaloMode,
      fxMode: 'auto' as const,
      customMusicUrl: detectedCustomMusicUrl,
      plainScriptText: blocks.slice(0, 6).join('\n\n'),
      aiModelUsed: 'ATLAS Cerebro Autónomo + Wikipedia ES ($0.00)',
      directorSummary: `Proyecto configurado para "${cleanedSubject}" (${detectedGenre} · ${detectedFormat === 'horizontal' ? '16:9 Horizontal' : '9:16 Vertical'} · ${detectedSeconds}s · Full HD 1080p)${detectedCustomMusicUrl ? ' + Música a la Carta extraída de tu enlace' : ''}.`
    };
  };

  const handleDirectorChatPrompt = async (autoProduce: boolean = false) => {
    const rawP = directorChatPrompt.trim();
    if (!rawP) {
      setDirectorChatReply('❌ Escribí primero tu mensaje o instrucción en la caja de chat.');
      return;
    }
    const nowTime = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    const nextHistory = [
      ...directorChatMessages,
      { role: 'user' as const, text: rawP, at: nowTime }
    ];
    setDirectorChatMessages(nextHistory);
    setDirectorChatPrompt('');
    setInterpretingChatPrompt(true);
    setDirectorChatReply('⏳ Argon 4 + Director ATLAS procesando tu mensaje con memoria de sesión…');
    try {
      const {data}=await supabase.auth.getSession();
      const authHeaders:Record<string,string>={'Content-Type':'application/json'};
      if(data?.session?.access_token&&!data.session.user?.is_anonymous){
        authHeaders.Authorization='Bearer '+data.session.access_token;
      }
      const currentDraftPayload = {
        subject: subject.trim(),
        genre: genre === 'Otro' ? customGenre.trim() : genre,
        format,
        seconds,
        voiceId: selectedElevenVoiceId,
        zocaloMode,
        fxMode,
        alacarteMusicUrl: alacarteMusicUrl.trim(),
        script: script.trim()
      };
      let json: any = null;
      for (const endpoint of ['/api/atlas/video/director-chat-prompt', '/api/user/atlas-video-missions/factory-requests/director-chat-prompt']) {
        try {
          const res=await fetch(endpoint,{
            method:'POST',cache:'no-store',headers:authHeaders,
            body:JSON.stringify({
              prompt: rawP,
              history: nextHistory.slice(-8).map(m => ({ role: m.role, text: m.text })),
              currentDraft: currentDraftPayload,
              preferredEngine: directorChatEngine
            })
          });
          const ct = String(res.headers.get('content-type') || '');
          if (res.ok && ct.includes('application/json')) {
            json = await res.json();
            if (json && typeof json === 'object') break;
          }
        } catch {}
      }
      if (!json) {
        json = await interpretPromptClientFallback(rawP);
      }

      const shouldApply = json.applyToForm !== false;
      if (shouldApply) {
        if(typeof json.genre==='string'&&genres.includes(json.genre as typeof genres[number])){
          setGenre(json.genre);
        }
        if(typeof json.subject==='string'&&json.subject.trim()){
          setSubject(json.subject.trim());
        }
        if(json.format==='vertical'||json.format==='horizontal'||json.format==='cuadrado'){
          setFormat(json.format);
        }
        if(typeof json.seconds==='string'&&json.seconds.trim()){
          setSeconds(json.seconds.trim());
        }
        if(typeof json.voiceId==='string'&&json.voiceId.trim()){
          setSelectedElevenVoiceId(json.voiceId.trim());
        }
        if(json.zocaloMode==='smart_full'||json.zocaloMode==='floating_text'||json.zocaloMode==='music_pill'||json.zocaloMode==='clean_none'){
          setZocaloMode(json.zocaloMode);
        }
        if(json.fxMode==='auto'||json.fxMode==='cinema'||json.fxMode==='flash_tv'||json.fxMode==='vintage'||json.fxMode==='dynamic'){
          setFxMode(json.fxMode);
        }
        if(typeof json.customMusicUrl==='string'&&json.customMusicUrl.trim()){
          setAlacarteMusicUrl(json.customMusicUrl.trim());
        }
        if(typeof json.plainScriptText==='string'&&json.plainScriptText.trim()){
          setScript(json.plainScriptText.trim());
        }
      }

      const modelLabel = String(json.aiModelUsed || 'Argon 4 · gemma-4-26b-a4b-it ($0.00)');
      const replyText = String(json.directorSummary || 'Listo, actualicé el proyecto según tu indicación.');
      const advNote = String(json.argonAdvisoryNote || '');
      setDirectorChatModelUsed(modelLabel);
      setDirectorChatReply(`✅ ${replyText}`);
      setDirectorChatMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: replyText,
          advisory: advNote || undefined,
          model: modelLabel,
          intent: String(json.intent || 'CREATE_OR_UPDATE_PROJECT'),
          at: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
        }
      ]);

      if (json.triggerRemasterLast && cloudDeliveries.length > 0) {
        await remasterCloudDelivery(cloudDeliveries[0], '4k');
        return;
      }

      if (autoProduce || json.autoProduceNow === true) {
        const nextScript = (typeof json.plainScriptText==='string'&&json.plainScriptText.trim())
          ? json.plainScriptText.trim()
          : (script.trim() || rawP);
        const effZocalo = json.zocaloMode || zocaloMode || 'smart_full';
        const effFx = json.fxMode || fxMode || 'auto';
        const effVoice = json.voiceId || selectedElevenVoiceId || 'IKne3meq5aSn9XLyUdCD';
        const zTag = `[ZOCALO:${effZocalo}]`;
        const fxTag = `[FX:${effFx}]`;
        const vTag = `[VOZ_ID:${effVoice}]`;
        const aTag = (avatarRole!=='none' || voiceGender!=='male') ? `[AVATAR:${avatarRole}:${voiceGender}]` : '';
        const cleanSubj = String(json.subject || subject || rawP).replace(/https?:\/\/[^\s"'<>]+/gi, '').trim().slice(0, 95);
        const fullSubject = `${fxTag} ${zTag} ${vTag} ${aTag} ${cleanSubj}`.replace(/\s+/g, ' ').trim();
        const cleanElKey = elevenApiKey.trim().replace(/[^a-zA-Z0-9_-]/g, '');
        const fullScript = nextScript + (cleanElKey ? `\n[EL_KEY:${cleanElKey}]` : '');
        const effMusicUrl = String(json.customMusicUrl || alacarteMusicUrl || '').trim();
        const combinedRefs = [
          ...parsedVideoUrls,
          ...(effMusicUrl && /^https?:\/\//i.test(effMusicUrl) ? [`${effMusicUrl}#atlas-alacarte-music`] : [])
        ].slice(0, 20);
        const reqPayload: VideoRequest = {
          schema: 'ATLAS_VIDEO_FACTORY_REQUEST_V1',
          genre: json.genre || genre || 'Informe deportivo',
          subject: fullSubject,
          durationSeconds: Number(json.seconds || seconds || 60),
          quantity: 1,
          format: json.format || format || 'vertical',
          script: fullScript,
          references: combinedRefs,
          rules: {existingFirst:true,cloudFirst:true,noPaidApis:true,noPublication:true,requireRealEvidenceForFacts:true,finalHumanApproval:true},
          status: 'PREPARED_NOT_DISPATCHED'
        };
        setPrepared(reqPayload);
        setDirectorChatReply(`🚀 Enviando "${cleanSubj}" directo a producción Full HD 1080p en Google Colab…`);
        const prodRes = await fetch('/api/user/atlas-video-missions/factory-requests',{
          method:'POST',cache:'no-store',headers:authHeaders,
          body:JSON.stringify(reqPayload)
        });
        const receipt = await prodRes.json();
        if(!prodRes.ok) throw Error(receipt.error || 'No se pudo enviar a producción.');
        setDispatch({...(receipt as FactoryReceipt),status:'RUNNING',blocker:'⏳ Compilando guion en 6 bloques de voz, música y fuentes HD y encolando en Google Colab…'});
        const autoRes = await fetch('/api/user/atlas-video-missions/factory-requests/'+encodeURIComponent(receipt.id)+'/auto-produce',{
          method:'POST',cache:'no-store',headers:authHeaders,signal:AbortSignal.timeout(45000)
        });
        const autoJson = await autoRes.json();
        if (autoRes.ok && (autoJson.status==='AUTO_MISSION_COMPILED_AND_ENQUEUED'||autoJson.status==='ENQUEUED_FOR_PERSISTENT_COLAB_WORKER')) {
          setDispatch(prev=>prev?{...prev,status:'RUNNING',productionStarted:true,blocker:'🎬 Encolado y produciendo automáticamente en Google Colab (Full HD 1080p · CRF 16). El MP4 aparecerá en el reproductor apenas termine.'}:prev);
        }
        const confirmProd = `🚀 ¡En producción! "${cleanSubj}" (ID: ${receipt.id}) ya está en la cola de Google Colab (Full HD 1080p · CRF 16${effMusicUrl ? ' · Música: ' + effMusicUrl : ''}).`;
        setMessage(confirmProd);
        setDirectorChatReply(confirmProd);
        setDirectorChatMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            text: confirmProd,
            model: 'Cola Automática Google Colab Cloud-First',
            intent: 'PRODUCE_NOW',
            at: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
          }
        ]);
        await loadFactoryLearningAndDeliveries();
      } else if (json.intent === 'AUDIT_OR_STATUS_QUERY') {
        await loadFactoryLearningAndDeliveries();
      }
    } catch(e) {
      const errTxt = '❌ '+(e instanceof Error?e.message:'Error al procesar tu mensaje.');
      setDirectorChatReply(errTxt);
      setDirectorChatMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: errTxt,
          at: new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
        }
      ]);
    } finally {
      setInterpretingChatPrompt(false);
    }
  };

  const handleUploadFilesFromDevice=async(files:FileList|null,target:'references'|'avatar'|'alacarte_music'|'alacarte_visual'|'alacarte_voice')=>{
    if(!files||files.length===0)return;
    setUploadingMedia(true);
    setUploadStatusMsg(`⏳ Subiendo ${files.length===1?`"${files[0].name}"`:`${files.length} archivos`} desde tu dispositivo a Supabase privado…`);
    try{
      const {data}=await supabase.auth.getSession();
      const authHeaders:Record<string,string>={'Content-Type':'application/json'};
      if(data?.session?.access_token&&!data.session.user?.is_anonymous){
        authHeaders.Authorization='Bearer '+data.session.access_token;
      }
      const newSignedUrls:string[]=[];
      const labelUpdates:Record<string,string>={};
      for(let i=0;i<files.length;i++){
        const f=files[i];
        setUploadStatusMsg(`⏳ Subiendo (${i+1}/${files.length}): "${f.name}" (${(f.size/(1024*1024)).toFixed(1)} MB)…`);
        const initRes=await fetch('/api/user/atlas-video-missions/factory-requests/create-upload-url',{
          method:'POST',cache:'no-store',headers:authHeaders,
          body:JSON.stringify({filename:f.name,contentType:f.type||'video/mp4'})
        });
        const initJson=await initRes.json();
        if(!initRes.ok||!initJson.signedUploadUrl){
          throw Error(initJson.error||'No se pudo iniciar la subida a Supabase.');
        }
        const putRes=await fetch(initJson.signedUploadUrl,{
          method:'PUT',
          headers:{'Content-Type':f.type||'video/mp4'},
          body:f
        });
        if(!putRes.ok){
          throw Error(`Error al transferir "${f.name}" a la nube (${putRes.status}).`);
        }
        const finRes=await fetch('/api/user/atlas-video-missions/factory-requests/finalize-upload-url',{
          method:'POST',cache:'no-store',headers:authHeaders,
          body:JSON.stringify({objectPath:initJson.objectPath})
        });
        const finJson=await finRes.json();
        if(!finRes.ok||!finJson.signedReadUrl){
          throw Error(finJson.error||'No se pudo obtener el enlace firmado del video subido.');
        }
        newSignedUrls.push(finJson.signedReadUrl);
        labelUpdates[finJson.signedReadUrl]=f.name;
      }
      setUploadedFileLabels(prev=>({...prev,...labelUpdates}));
      if(target==='avatar'&&newSignedUrls[0]){
        setCustomAvatarUrl(newSignedUrls[0]);
        setUploadStatusMsg(`✅ Tu archivo "${files[0].name}" fue subido y asignado como tu Avatar en movimiento.`);
      }else if(target==='alacarte_music'&&newSignedUrls[0]){
        setAlacarteMusicUrl(newSignedUrls[0]);
        setUploadStatusMsg(`✅ Música "${files[0].name}" subida a la nube para el bloque Video a la Carta.`);
      }else if(target==='alacarte_voice'&&newSignedUrls[0]){
        setAlacarteVoiceUrl(newSignedUrls[0]);
        setAlacarteNoVoice(false);
        setUploadStatusMsg(`✅ Voz propia/externa "${files[0].name}" (NotebookLM / Gemini Ultra / Grabación) subida a la nube para locutar el video.`);
      }else if(target==='alacarte_visual'&&newSignedUrls.length>0){
        const mergedVis=Array.from(new Set([...parsedAlacarteVisualUrls,...newSignedUrls])).slice(0,15);
        setAlacarteVisualUrls(mergedVis.join('\n'));
        setUploadStatusMsg(`✅ ${newSignedUrls.length} archivo(s) de imagen/video subido(s) a la opción 3 (Solo Imágenes/Videos).`);
      }else if(newSignedUrls.length>0){
        const merged=Array.from(new Set([...parsedVideoUrls,...newSignedUrls])).slice(0,20);
        setReferences(merged.join('\n'));
        setUploadStatusMsg(`✅ ${newSignedUrls.length===1?`Archivo "${files[0].name}" subido`:`${newSignedUrls.length} archivos subidos`} desde tu dispositivo y listo${newSignedUrls.length===1?'':'s'} para producir.`);
      }
    }catch(e){
      setUploadStatusMsg('❌ '+(e instanceof Error?e.message:'No se pudo subir el archivo.'));
    }finally{
      setUploadingMedia(false);
    }
  };

  const captureCurrentDraft = (): ParallelDraftMission => {
    const pendingInlineUrls = newVideoUrl.split(/[\r\n,\s]+/).map(v=>v.trim()).filter(v=>/^https?:\/\//i.test(v));
    const finalRefs = Array.from(new Set([...parsedVideoUrls, ...pendingInlineUrls])).slice(0, 20);
    const pendingVisualInline = newAlacarteVisualUrl.split(/[\r\n,\s]+/).map(v=>v.trim()).filter(v=>/^https?:\/\//i.test(v));
    const finalVisualRefs = Array.from(new Set([...parsedAlacarteVisualUrls, ...pendingVisualInline])).slice(0, 15);
    return {
      genre,
      customGenre,
      subject,
      seconds,
      quantity,
      format,
      script,
      references: finalRefs.join('\n'),
      videoMixMode,
      avatarRole,
      voiceGender,
      selectedElevenVoiceId,
      fxMode,
      zocaloMode,
      screenMessage,
      avatarIntroMessage,
      avatarMidMessage,
      avatarMessage,
      customAvatarUrl,
      alacarteMusicUrl,
      alacarteScriptUrl,
      alacarteNoVoice,
      alacarteVisualUrls: finalVisualRefs.join('\n'),
      alacarteVoiceUrl
    };
  };

  const applyDraftToForm = (d: ParallelDraftMission) => {
    setGenre(d.genre || 'Automático');
    setCustomGenre(d.customGenre || '');
    setSubject(d.subject || '');
    setSeconds(d.seconds || '60');
    setQuantity(d.quantity || '1');
    setFormat(d.format || 'vertical');
    setScript(d.script || '');
    setReferences(d.references || '');
    setNewVideoUrl('');
    setVideoMixMode(d.videoMixMode || 'atlas');
    setAvatarRole(d.avatarRole || 'none');
    setVoiceGender(d.voiceGender || 'male');
    setSelectedElevenVoiceId(d.selectedElevenVoiceId || 'piper_davefx');
    setFxMode(d.fxMode || 'auto');
    setZocaloMode(d.zocaloMode || 'clean_none');
    setScreenMessage(d.screenMessage || '');
    setAvatarIntroMessage(d.avatarIntroMessage || '');
    setAvatarMidMessage(d.avatarMidMessage || '');
    setAvatarMessage(d.avatarMessage || '');
    setCustomAvatarUrl(d.customAvatarUrl || '');
    setAlacarteMusicUrl(d.alacarteMusicUrl || '');
    setAlacarteScriptUrl(d.alacarteScriptUrl || '');
    setAlacarteNoVoice(Boolean(d.alacarteNoVoice));
    setAlacarteVisualUrls(d.alacarteVisualUrls || '');
    setAlacarteVoiceUrl(d.alacarteVoiceUrl || '');
    setNewAlacarteVisualUrl('');
  };

  const allParallelMissions = (): ParallelDraftMission[] => {
    const cur = captureCurrentDraft();
    if (parallelDrafts.length === 0) return [cur];
    const copy = [...parallelDrafts];
    copy[activeDraftIdx] = cur;
    return copy;
  };

  const switchParallelTab = (targetIdx: number) => {
    const list = allParallelMissions();
    if (targetIdx < 0 || targetIdx >= list.length) return;
    setParallelDrafts(list);
    setActiveDraftIdx(targetIdx);
    applyDraftToForm(list[targetIdx]);
    setMessage('');
  };

  const addAnotherParallelMission = (suggestedGenre?: string) => {
    const list = allParallelMissions();
    if (list.length >= 5) {
      setMessage('El máximo es de 5 misiones simultáneas en paralelo.');
      return;
    }
    const defaultGenresOrder = ['Documental', 'Informe deportivo', 'Informe periodístico', 'Educativo', 'Biografía'];
    const nextGenre = suggestedGenre || defaultGenresOrder[list.length % defaultGenresOrder.length] || 'Automático';
    const nextVoiceObj = elevenLabsSpanishVoices[(list.length + 1) % elevenLabsSpanishVoices.length];
    const newDraft: ParallelDraftMission = {
      genre: nextGenre,
      customGenre: '',
      subject: '',
      seconds: seconds || '60',
      quantity: '1',
      format,
      script: '',
      references: '',
      videoMixMode: 'atlas',
      avatarRole: 'none',
      voiceGender: nextVoiceObj?.gender || 'male',
      selectedElevenVoiceId: nextVoiceObj?.id || selectedElevenVoiceId,
      fxMode: 'auto',
      zocaloMode: 'clean_none',
      screenMessage: '',
      avatarIntroMessage: '',
      avatarMidMessage: '',
      avatarMessage: '',
      customAvatarUrl: '',
      alacarteMusicUrl: '',
      alacarteScriptUrl: '',
      alacarteNoVoice: false,
      alacarteVisualUrls: '',
      alacarteVoiceUrl: ''
    };
    const nextList = [...list, newDraft];
    setParallelDrafts(nextList);
    setActiveDraftIdx(nextList.length - 1);
    applyDraftToForm(newDraft);
    setMessage(`➕ Misión #${nextList.length} agregada al lote paralelo (${nextGenre}). Completá su tema o guion y podés agregar hasta 5.`);
  };

  const removeParallelMissionAt = (idxToRemove: number) => {
    const list = allParallelMissions();
    if (list.length <= 1) return;
    const nextList = list.filter((_, i) => i !== idxToRemove);
    const nextIdx = Math.min(activeDraftIdx, nextList.length - 1);
    setParallelDrafts(nextList.length === 1 ? [] : nextList);
    setActiveDraftIdx(nextIdx);
    applyDraftToForm(nextList[nextIdx]);
  };

  const buildRequestFromDraft = (d: ParallelDraftMission, idxLabel: number): { req?: VideoRequest; err?: string } => {
    const sec = Number(d.seconds), n = Number(d.quantity || '1');
    const finalRefs = Array.from(new Set(
      (d.references || '').split(/[\r\n,\s]+/).map(v=>v.trim()).filter(v=>/^https?:\/\//i.test(v))
    )).slice(0, 20);
    const cleanMusicUrl = /^https?:\/\//i.test((d.alacarteMusicUrl || '').trim()) ? d.alacarteMusicUrl.trim() : '';
    const cleanScriptUrl = /^https?:\/\//i.test((d.alacarteScriptUrl || '').trim()) ? d.alacarteScriptUrl.trim() : '';
    const cleanVoiceUrl = /^https?:\/\//i.test((d.alacarteVoiceUrl || '').trim()) ? d.alacarteVoiceUrl.trim() : '';
    const cleanVisualUrls = Array.from(new Set(
      (d.alacarteVisualUrls || '').split(/[\r\n,\s]+/).map(v=>v.trim()).filter(v=>/^https?:\/\//i.test(v))
    )).slice(0, 15);
    const hasAlacarte = Boolean(cleanMusicUrl || cleanScriptUrl || cleanVoiceUrl || cleanVisualUrls.length > 0);
    if (!d.subject.trim() && !d.script.trim() && finalRefs.length === 0 && !hasAlacarte) {
      return { err: `En la Misión #${idxLabel}: indicá un tema, un guion o al menos una URL de video.` };
    }
    if (!Number.isSafeInteger(sec)||sec<10||sec>7200||!Number.isSafeInteger(n)||n<1||n>100) {
      return { err: `En la Misión #${idxLabel}: la duración debe ser entre 10 y 7200 segundos.` };
    }
    const actualGenre = d.genre==='Otro' ? d.customGenre.trim() : d.genre;
    if (!actualGenre) return { err: `En la Misión #${idxLabel}: escribí el género que querés crear.` };
    const baseSubject = d.subject.trim() || d.script.trim().split(/\r?\n/)[0].slice(0,90).trim() || (hasAlacarte ? 'Video a la Carta' : (d.videoMixMode==='remaster_4k' ? `Remasterización 4K Ultra HD (${finalRefs.length})` : (d.videoMixMode==='remaster' ? `Remasterización HD 1080p (${finalRefs.length})` : (d.videoMixMode==='raw' ? `Fusión cruda de videos (${finalRefs.length})` : (d.videoMixMode==='recreate' ? `Recrear con otros videos (${finalRefs.length})` : `Producción con videos seleccionados (${finalRefs.length})`)))));
    const cleanScreenMsg = (d.screenMessage || '').split(/\r?\n/).map(s=>s.trim().replace(/[\[\]]/g, '')).filter(Boolean).join(' || ');
    const effectiveZocalo = (cleanScreenMsg && (!d.zocaloMode || d.zocaloMode === 'clean_none')) ? 'floating_text' : (d.zocaloMode || 'clean_none');
    const fxPrefix = `[FX:${d.fxMode}] [ZOCALO:${effectiveZocalo}] [VOZ_ID:${d.selectedElevenVoiceId}] `;
    const avatarPrefix = (d.avatarRole!=='none' || d.voiceGender!=='male') ? `[AVATAR:${d.avatarRole}:${d.voiceGender}] ` : '';
    const silentVoicePrefix = (d.alacarteNoVoice && !cleanVoiceUrl) ? '[MODO_SIN_VOZ] ' : '';
    const modePrefix = (!hasAlacarte && finalRefs.length>0) ? (d.videoMixMode==='remaster_4k' ? '[REMASTERIZAR_4K] ' : (d.videoMixMode==='remaster' ? '[REMASTERIZAR_HD] ' : (d.videoMixMode==='raw' ? '[MODO_CRUDO] ' : (d.videoMixMode==='recreate' ? '[MODO_RECREAR_OTRAS_FUENTES] ' : '')))) : (d.videoMixMode==='remaster_4k' ? '[REMASTERIZAR_4K] ' : (d.videoMixMode==='remaster' ? '[REMASTERIZAR_HD] ' : ''));
    const effectiveSubject = fxPrefix + avatarPrefix + silentVoicePrefix + modePrefix + baseSubject;
    const cleanIntro = d.avatarIntroMessage.trim().replace(/[\[\]]/g, '');
    const cleanMid = d.avatarMidMessage.trim().replace(/[\[\]]/g, '');
    const cleanMsg = d.avatarMessage.trim().replace(/[\[\]]/g, '');
    const cleanElKey = elevenApiKey.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    const effectiveScript = d.script.trim()
      + (cleanElKey ? `\n[EL_KEY:${cleanElKey}]` : '')
      + (cleanScreenMsg ? `\n[MENSAJE_PANTALLA:${cleanScreenMsg}]` : '')
      + (cleanIntro ? `\n[MENSAJE_AVATAR_INTRO:${cleanIntro}]` : '')
      + (cleanMid ? `\n[MENSAJE_AVATAR_MID:${cleanMid}]` : '')
      + (cleanMsg ? `\n[MENSAJE_AVATAR:${cleanMsg}]` : '');
    const combinedRefs = [
      ...finalRefs,
      ...(cleanMusicUrl ? [`${cleanMusicUrl}#atlas-alacarte-music`] : []),
      ...(cleanScriptUrl ? [`${cleanScriptUrl}#atlas-alacarte-script`] : []),
      ...(cleanVoiceUrl ? [`${cleanVoiceUrl}#atlas-alacarte-voice`] : []),
      ...cleanVisualUrls.map(u => `${u}#atlas-alacarte-visual`),
      ...((d.avatarRole==='custom' && /^https?:\/\//i.test(d.customAvatarUrl.trim())) ? [`${d.customAvatarUrl.trim()}#atlas-avatar`] : [])
    ].slice(0, 20);
    return {
      req: {
        schema:'ATLAS_VIDEO_FACTORY_REQUEST_V1',
        genre:actualGenre,
        subject:effectiveSubject,
        durationSeconds:sec,
        quantity:n,
        format:d.format,
        script:effectiveScript,
        references:combinedRefs,
        rules:{existingFirst:true,cloudFirst:true,noPaidApis:true,noPublication:true,requireRealEvidenceForFacts:true,finalHumanApproval:true},
        status:'PREPARED_NOT_DISPATCHED'
      }
    };
  };

  const prepare = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();setMessage('');
    const draftsList = allParallelMissions();
    if (draftsList.length > 1) {
      const builtReqs: VideoRequest[] = [];
      for (let i = 0; i < draftsList.length; i++) {
        const res = buildRequestFromDraft(draftsList[i], i + 1);
        if (res.err || !res.req) {
          switchParallelTab(i);
          setMessage(res.err || `Revisá los datos de la Misión #${i + 1}.`);
          return;
        }
        builtReqs.push(res.req);
      }
      setPrepared(builtReqs[0]);setDispatch(null);setSubmitting(true);
      try {
        const {data}=await supabase.auth.getSession();
        const authHeaders:Record<string,string>={'Content-Type':'application/json'};
        if(data?.session?.access_token&&!data.session.user?.is_anonymous){
          authHeaders.Authorization='Bearer '+data.session.access_token;
        }
        setMessage(`⏳ Compilando y lanzando ${builtReqs.length} misiones distintas en paralelo hacia Google Colab…`);
        const batchRes=await fetch('/api/user/atlas-video-missions/factory-requests/parallel-batch',{
          method:'POST',cache:'no-store',headers:authHeaders,
          body:JSON.stringify({missions:builtReqs}),signal:AbortSignal.timeout(60000)});
        const batchJson=await batchRes.json();
        if(!batchRes.ok)throw Error(batchJson.error||'No se pudo enviar el lote paralelo.');
        const firstReceipt=Array.isArray(batchJson.receipts)&&batchJson.receipts[0]?batchJson.receipts[0]:{id:batchJson.batchId||'batch',status:'RUNNING',createdAt:new Date().toISOString(),productionStarted:true,videoUrl:null};
        setDispatch({...firstReceipt,status:'RUNNING',productionStarted:true,blocker:`🚀 Produciendo ${builtReqs.length} videos distintos EN PARALELO simultáneamente en Google Colab (${builtReqs.map((r,idx)=>`#${idx+1} ${r.genre}`).join(' · ')}).`});
        setMessage(`✅ ¡Lote de ${builtReqs.length} misiones enviado! Se están renderizando los ${builtReqs.length} videos en paralelo al mismo tiempo en Google Colab.`);
        await loadFactoryLearningAndDeliveries(false);
      } catch(e) {
        setMessage((e instanceof Error?e.message:'No se pudo enviar el lote paralelo.')+' No se inició ningún render.');
      } finally {
        setSubmitting(false);
      }
      return;
    }
    const sec = Number(seconds), n = Number(quantity);
    const pendingInlineUrls = newVideoUrl.split(/[\r\n,\s]+/).map(v=>v.trim()).filter(v=>/^https?:\/\//i.test(v));
    const finalRefs = Array.from(new Set([...parsedVideoUrls, ...pendingInlineUrls])).slice(0, 20);
    if (pendingInlineUrls.length) {
      setReferences(finalRefs.join('\n'));
      setNewVideoUrl('');
    }
    const pendingVisualInline = newAlacarteVisualUrl.split(/[\r\n,\s]+/).map(v=>v.trim()).filter(v=>/^https?:\/\//i.test(v));
    const finalVisualRefs = Array.from(new Set([...parsedAlacarteVisualUrls, ...pendingVisualInline])).slice(0, 15);
    if (pendingVisualInline.length) {
      setAlacarteVisualUrls(finalVisualRefs.join('\n'));
      setNewAlacarteVisualUrl('');
    }
    const cleanMusicUrl = /^https?:\/\//i.test(alacarteMusicUrl.trim()) ? alacarteMusicUrl.trim() : '';
    const cleanScriptUrl = /^https?:\/\//i.test(alacarteScriptUrl.trim()) ? alacarteScriptUrl.trim() : '';
    const cleanVoiceUrl = /^https?:\/\//i.test(alacarteVoiceUrl.trim()) ? alacarteVoiceUrl.trim() : '';
    const hasAlacarte = Boolean(cleanMusicUrl || cleanScriptUrl || cleanVoiceUrl || finalVisualRefs.length > 0);
    if (!subject.trim() && !script.trim() && finalRefs.length === 0 && !hasAlacarte) {
      setMessage('Indicá un tema, un guion o al menos una URL de video.');return;
    }
    if (!Number.isSafeInteger(sec)||sec<10||sec>7200||!Number.isSafeInteger(n)||n<1||n>100) {
      setMessage('La duración debe ser entre 10 y 7200 segundos; la cantidad entre 1 y 100.');return;
    }
    const actualGenre = genre==='Otro' ? customGenre.trim() : genre;
    if(!actualGenre){setMessage('Escribí el género que querés crear.');return;}
    const cleanScreenMsg = (screenMessage || '').split(/\r?\n/).map(s=>s.trim().replace(/[\[\]]/g, '')).filter(Boolean).join(' || ');
    const effectiveZocalo = (cleanScreenMsg && (!zocaloMode || zocaloMode === 'clean_none')) ? 'floating_text' : (zocaloMode || 'clean_none');
    const baseSubject = subject.trim() || script.trim().split(/\r?\n/)[0].slice(0,90).trim() || (hasAlacarte ? 'Video a la Carta' : (videoMixMode==='remaster_4k' ? `Remasterización 4K Ultra HD (${finalRefs.length})` : (videoMixMode==='remaster' ? `Remasterización HD 1080p (${finalRefs.length})` : (videoMixMode==='raw' ? `Fusión cruda de videos (${finalRefs.length})` : (videoMixMode==='recreate' ? `Recrear con otros videos (${finalRefs.length})` : `Producción con videos seleccionados (${finalRefs.length})`)))));
    const fxPrefix = `[FX:${fxMode}] [ZOCALO:${effectiveZocalo}] [VOZ_ID:${selectedElevenVoiceId}] `;
    const avatarPrefix = (avatarRole!=='none' || voiceGender!=='male') ? `[AVATAR:${avatarRole}:${voiceGender}] ` : '';
    const silentVoicePrefix = (alacarteNoVoice && !cleanVoiceUrl) ? '[MODO_SIN_VOZ] ' : '';
    const modePrefix = (!hasAlacarte && finalRefs.length>0) ? (videoMixMode==='remaster_4k' ? '[REMASTERIZAR_4K] ' : (videoMixMode==='remaster' ? '[REMASTERIZAR_HD] ' : (videoMixMode==='raw' ? '[MODO_CRUDO] ' : (videoMixMode==='recreate' ? '[MODO_RECREAR_OTRAS_FUENTES] ' : '')))) : (videoMixMode==='remaster_4k' ? '[REMASTERIZAR_4K] ' : (videoMixMode==='remaster' ? '[REMASTERIZAR_HD] ' : ''));
    const effectiveSubject = fxPrefix + avatarPrefix + silentVoicePrefix + modePrefix + baseSubject;
    const cleanIntro = avatarIntroMessage.trim().replace(/[\[\]]/g, '');
    const cleanMid = avatarMidMessage.trim().replace(/[\[\]]/g, '');
    const cleanMsg = avatarMessage.trim().replace(/[\[\]]/g, '');
    const cleanElKey = elevenApiKey.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    const effectiveScript = script.trim()
      + (cleanElKey ? `\n[EL_KEY:${cleanElKey}]` : '')
      + (cleanScreenMsg ? `\n[MENSAJE_PANTALLA:${cleanScreenMsg}]` : '')
      + (cleanIntro ? `\n[MENSAJE_AVATAR_INTRO:${cleanIntro}]` : '')
      + (cleanMid ? `\n[MENSAJE_AVATAR_MID:${cleanMid}]` : '')
      + (cleanMsg ? `\n[MENSAJE_AVATAR:${cleanMsg}]` : '');
    const finalRefsWithAvatar = [
      ...finalRefs,
      ...(cleanMusicUrl ? [`${cleanMusicUrl}#atlas-alacarte-music`] : []),
      ...(cleanScriptUrl ? [`${cleanScriptUrl}#atlas-alacarte-script`] : []),
      ...(cleanVoiceUrl ? [`${cleanVoiceUrl}#atlas-alacarte-voice`] : []),
      ...finalVisualRefs.map(u => `${u}#atlas-alacarte-visual`),
      ...((avatarRole==='custom' && /^https?:\/\//i.test(customAvatarUrl.trim())) ? [`${customAvatarUrl.trim()}#atlas-avatar`] : [])
    ].slice(0, 20);
    const next: VideoRequest = {schema:'ATLAS_VIDEO_FACTORY_REQUEST_V1',genre:actualGenre,subject:effectiveSubject,durationSeconds:sec,quantity:n,format,script:effectiveScript,references:finalRefsWithAvatar,
      rules:{existingFirst:true,cloudFirst:true,noPaidApis:true,noPublication:true,requireRealEvidenceForFacts:true,finalHumanApproval:true},status:'PREPARED_NOT_DISPATCHED'};
    setPrepared(next);setDispatch(null);setSubmitting(true);
    try {
      const {data}=await supabase.auth.getSession();
      const authHeaders:Record<string,string>={'Content-Type':'application/json'};
      if(data?.session?.access_token&&!data.session.user?.is_anonymous){
        authHeaders.Authorization='Bearer '+data.session.access_token;
      }
      const response=await fetch('/api/user/atlas-video-missions/factory-requests',{
        method:'POST',cache:'no-store',
        headers:authHeaders,
        body:JSON.stringify(next),signal:AbortSignal.timeout(15000)});
      let receipt:any;try{receipt=await response.json();}catch{throw Error('El servidor todavía no admite misiones nuevas.');}
      if(!response.ok)throw Error(receipt.error||'El servidor no pudo admitir la misión.');
      if(typeof receipt.id!=='string'||typeof receipt.status!=='string')throw Error('Respuesta de recepción no verificable.');
      setDispatch({...(receipt as FactoryReceipt),status:'RUNNING',blocker:videoMixMode==='raw'&&finalRefs.length>0?'⏳ Preparando Fusión Cruda Coherente (audio original, sin voz IA ni placas) y encolando en Google Colab…':'⏳ Compilando guion en 6 bloques de voz, buscando retratos Wikidata P18 + videos YouTube CC / Internet Archive y encolando en Google Colab…'});
      setMessage(videoMixMode==='raw'&&finalRefs.length>0?'Preparando Fusión Cruda Coherente (audio original, sin voz IA ni placas) y encolando en Colab…':'Compilando guion en 6 bloques de voz, buscando retratos Wikidata P18 + videos YouTube CC / Internet Archive y encolando en Colab…');
      let autoMsg='';
      try{
        const autoRes=await fetch('/api/user/atlas-video-missions/factory-requests/'+encodeURIComponent(receipt.id)+'/auto-produce',{
          method:'POST',cache:'no-store',headers:authHeaders,signal:AbortSignal.timeout(45000)});
        const autoJson=await autoRes.json();
        if(autoRes.ok&&(autoJson.status==='AUTO_MISSION_COMPILED_AND_ENQUEUED'||autoJson.status==='ENQUEUED_FOR_PERSISTENT_COLAB_WORKER')){
          setDispatch(prev=>prev?{...prev,status:'RUNNING',productionStarted:true,blocker:'🎬 Encolado y produciendo automáticamente en Google Colab ($0.00). El MP4 aparecerá en el reproductor apenas termine.'}:prev);
          autoMsg=autoJson.isRawMergeMode
            ? ' ✅ Modo Crudo / Fusión Coherente ('+finalRefs.length+' video(s) en secuencia continua con su audio original normalizado, sin voz IA ni zócalos). Produciendo en Colab ahora mismo.'
            : ' ✅ Guion compilado en '+(autoJson.voiceBlocksCount||6)+' bloques de voz + '+(autoJson.youtubeCandidatesCount||2)+' candidatos YouTube CC + '+(autoJson.musicShortlist?.length||5)+' pistas instrumentales. Produciendo en Colab ahora mismo.';
          await loadFactoryLearningAndDeliveries(false);
        }else if(autoJson.error){
          autoMsg=' (Aviso auto-cola: '+autoJson.error+')';
        }
      }catch{/* Fallback to standard intake message if offline */}
      if(autoMsg){
        setMessage('Misión '+receipt.id+' en producción automática Cloud-First ($0.00):'+autoMsg);
      }else{
        setMessage(receipt.blocker?'Orden registrada. ATLAS indicó un bloqueo: '+receipt.blocker:'Orden recibida; consultá el estado antes de asumir producción.');
      }
    }catch(e){setMessage((e instanceof Error?e.message:'No se pudo enviar la misión.')+' No se inició ningún render.');}
    finally{setSubmitting(false);}
  };

  const inspectExistingArgon=async()=>{
    if(submitting)return;
    setSubmitting(true);setExistingArgonStatus('Consultando la misión existente sin reenviarla…');
    try{
      const {data,error}=await supabase.auth.getSession();
      if(error||!data.session||data.session.user.is_anonymous)throw Error('Iniciá sesión en YOUAPP.');
      const headers={Authorization:'Bearer '+data.session.access_token};
      const listRes=await fetch('/api/user/atlas-video-missions/factory-requests',{
        headers,cache:'no-store',signal:AbortSignal.timeout(12000)});
      if(!listRes.ok)throw Error('No se pudo consultar la cola privada.');
      const list=await listRes.json();
      const mission=Array.isArray(list.requests)?list.requests.find((x:any)=>x.id==='f_00859a04aeb52e4feb2e9cef'):null;
      if(!mission)throw Error('La misión de Justicia Social no figura para esta sesión.');
      const check=await fetch('/api/user/atlas-video-missions/factory-requests/'+encodeURIComponent(mission.id)+'/director-intake',{
        headers,cache:'no-store',signal:AbortSignal.timeout(12000)});
      if(!check.ok)throw Error('La recepción editorial del director todavía no está disponible.');
      const status=await check.json();
      if(status.missionId!==mission.id||status.cloudVerified!==true)throw Error('No se verificó el vínculo cloud.');
      const a=status.argonReview;
      if(a?.status==='DIRECTOR_DRAFT_CLIP_SELECTED_PENDING_PRODUCTION_GATES'&&
        a.selectedCandidateId==='pexels:3982009'&&a.productionAuthorized===false){
        setExistingArgonStatus('Atlas recibió la propuesta Argon para esta misión: pexels:3982009. Es asesoría editorial verificada, pendiente de derechos, QA y tu aprobación; no inició render.');
      }else{
        setExistingArgonStatus('La misión existe y está en nube, pero la propuesta Argon específica todavía no está certificada en la instancia activa.');
      }
    }catch(e){setExistingArgonStatus(e instanceof Error?e.message:'No se completó la consulta.');}
    finally{setSubmitting(false);}
  };

  const correctExistingJusticeDuration=async()=>{
    if(submitting)return;
    setSubmitting(true);setExistingArgonStatus('Verificando la misión existente de 60 segundos…');
    try{
      const {data,error}=await supabase.auth.getSession();
      if(error||!data.session||data.session.user.is_anonymous)throw Error('Iniciá sesión en YOUAPP.');
      const id='f_967f0885a6d2930bf1231a62';
      const headers={Authorization:'Bearer '+data.session.access_token};
      const current=await fetch('/api/user/atlas-video-missions/factory-requests/'+id,{headers,cache:'no-store'});
      if(!current.ok)throw Error('La misión no está disponible para esta cuenta.');
      const row=await current.json();
      if(row.id!==id||row.durationSeconds!==120||row.productionStarted!==false)
        throw Error('La misión cambió: no se realizará ninguna corrección automática.');
      const response=await fetch('/api/user/atlas-video-missions/factory-requests/'+id+'/duration-correction',{
        method:'POST',cache:'no-store',headers:{...headers,'Content-Type':'application/json'},
        body:JSON.stringify({schema:'ATLAS_FACTORY_DURATION_CORRECTION_V1',proposedDurationSeconds:60,
          expectedOriginalDurationSeconds:120,
          expectedCloudSha256:'192c2fb67e0d4d10418e5733e104688e7a9e7476aee86b993035671d6cbdb6a7'}),
        signal:AbortSignal.timeout(12000)});
      const receipt=await response.json();
      if(!response.ok)throw Error(receipt.error||'No se autorizó la corrección.');
      if(receipt.id!==id||receipt.requestedCorrectionSeconds!==60||
         receipt.correctionStatus!=='PENDING_CLOUD_RECONCILIATION'||receipt.productionStarted!==false)
         throw Error('El resultado de la corrección no está verificado.');
      setExistingArgonStatus('Corrección de 60 segundos registrada en la misma misión, preservando la solicitud original de 120. Pendiente de conciliar en Supabase y conectar el ejecutor cloud; no se inició render.');
    }catch(e){setExistingArgonStatus((e instanceof Error?e.message:'No se completó la corrección.')+' No se inició render.');}
    finally{setSubmitting(false);}
  };

  const verifyCorrectedCloudMission=async()=>{
    if(submitting)return;
    setSubmitting(true);setExistingArgonStatus('Atlas está leyendo la corrección privada en Supabase…');
    try{
      const {data,error}=await supabase.auth.getSession();
      if(error||!data.session||data.session.user.is_anonymous)throw Error('Iniciá sesión en YOUAPP.');
      const id='f_967f0885a6d2930bf1231a62';
      const response=await fetch('/api/user/atlas-video-missions/factory-requests/'+id+'/director-intake',{
        cache:'no-store',headers:{Authorization:'Bearer '+data.session.access_token},signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('No se pudo verificar la lectura de Atlas.');
      const x=await response.json();
      if(x.missionId!==id||x.correctedMission?.status!=='CLOUD_CORRECTION_READ_BY_ATLAS_DIRECTOR'||
         x.correctedMission.durationSeconds!==60||x.correctedMission.renderAllowed!==false)
        throw Error('La lectura de la corrección no está certificada.');
      setExistingArgonStatus('Atlas leyó y verificó en Supabase la misión corregida a 60 segundos. Falta certificar 5 fuentes pertinentes y conectar un ejecutor de películas cloud; no se inició render.');
    }catch(e){setExistingArgonStatus((e instanceof Error?e.message:'Lectura no disponible.')+' No se inició render.');}
    finally{setSubmitting(false);}
  };

  const refreshDispatch=async()=>{
    if(!dispatch||submitting)return;
    setSubmitting(true);
    try{
      const {data,error:authError}=await supabase.auth.getSession();
      if(authError||!data.session||data.session.user.is_anonymous)throw Error('Iniciá sesión en YOUAPP.');
      const response=await fetch('/api/user/atlas-video-missions/factory-requests/'+encodeURIComponent(dispatch.id),{
        cache:'no-store',headers:{Authorization:'Bearer '+data.session.access_token},signal:AbortSignal.timeout(12000)});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'No se pudo consultar.');
      setDispatch(result);
      setMessage(result.blocker||'Estado actualizado.');
    }catch(e){setMessage(e instanceof Error?e.message:'No se pudo consultar.');}
    finally{setSubmitting(false);}
  };

  useEffect(()=>{
    if(!dispatch||!['QUEUED','RUNNING','RENDERING','QA_PENDING'].includes(dispatch.status))return;
    let alive=true,polls=0;
    const timer=setInterval(async()=>{
      if(!alive||document.visibilityState==='hidden'||polls++>=30){if(polls>=30)clearInterval(timer);return;}
      try{
        const {data,error}=await supabase.auth.getSession();
        if(error||!data.session||data.session.user.is_anonymous)return;
        const res=await fetch('/api/user/atlas-video-missions/factory-requests/'+encodeURIComponent(dispatch.id),
          {cache:'no-store',headers:{Authorization:'Bearer '+data.session.access_token},signal:AbortSignal.timeout(12000)});
        if(!res.ok)return;
        const result=await res.json();
        if(alive&&result.id===dispatch.id&&typeof result.status==='string')setDispatch(result as FactoryReceipt);
      }catch{/* Polling failure never restarts a render or creates a new mission. */}
    },8000);
    return()=>{alive=false;clearInterval(timer);};
  },[dispatch?.id,dispatch?.status]);

  const copyOrder=async()=>{
    if(!prepared)return;
    const order='ATLAS — FÁBRICA DE VIDEOS\n'+JSON.stringify(prepared,null,2)+'\nINSTRUCCIÓN: usar el director, agentes, aprendizaje y motores existentes. Ejecutar solo en infraestructura autorizada. No declarar entregado sin MP4 verificado, fuentes y QA.';
    try {await navigator.clipboard.writeText(order);setMessage('Orden copiada. No se inició ningún render.');}
    catch {setMessage('No fue posible copiar automáticamente; comprobá los permisos del navegador.');}
  };

  return <main className="atlas-fabrica-videos" style={{width:'100%',minHeight:'100vh',background:'linear-gradient(180deg,#f2f8fd 0%,#f8fafc 33%,#f6f9fc 100%)',padding:'40px clamp(16px,3vw,44px) 90px',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif',color:'#172b4d',boxSizing:'border-box'}}>
    <style>{`
      .atlas-fabrica-videos *{box-sizing:border-box}
      .atlas-fabrica-videos .genre-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .atlas-fabrica-videos .factory-columns{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(285px,1fr);gap:20px;align-items:start;max-width:1220px;margin:0 auto}
      .atlas-fabrica-videos .field-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
      .atlas-fabrica-videos .genre-btn{min-height:74px;display:flex;gap:6px;flex-direction:column;align-items:center;justify-content:center;border-radius:14px;border:1px solid #e0e8f0;color:#405a72;background:#f9fbfd;cursor:pointer;font:inherit;font-size:12px;padding:10px 7px;transition:background .15s,border-color .15s,box-shadow .15s}
      .atlas-fabrica-videos .genre-btn span:first-child{filter:grayscale(.7);opacity:.8}
      .atlas-fabrica-videos .genre-btn[aria-pressed=true]{background:#e4f4ff;border-color:#71c6ef;color:#075985;box-shadow:0 0 0 1px #9fdcf6;font-weight:650}
      .atlas-fabrica-videos .genre-btn[aria-pressed=true] span:first-child{filter:none;opacity:1}
      .atlas-fabrica-videos .genre-btn:hover{border-color:#9edbf5;background:#eef8ff}
      .atlas-fabrica-videos .factory-primary{border:1px solid #70c4eb;background:linear-gradient(180deg,#7bd2f6,#52bdee);color:#083a55;font-weight:750;padding:14px 22px;border-radius:13px;cursor:pointer;font-size:15px;width:100%;box-shadow:0 5px 16px rgba(49,151,209,.14)}
      .atlas-fabrica-videos .factory-primary:hover{background:#84d3f5}
      .atlas-fabrica-videos .factory-secondary{border:1px solid #cfdfec;background:#f8fbff;color:#23618a;padding:12px 16px;border-radius:11px;cursor:pointer;font:inherit;font-weight:550}
      .atlas-fabrica-videos .factory-secondary:hover{background:#edf8ff;border-color:#9ccfec}
      .atlas-fabrica-videos :is(input,textarea,select)::placeholder{color:#8da4b7}
      .atlas-fabrica-videos :is(input,textarea,select):focus-visible,.atlas-fabrica-videos button:focus-visible{outline:2px solid #48b7e8;outline-offset:2px}
      .atlas-fabrica-videos textarea{resize:vertical;min-height:110px}
      .atlas-fabrica-videos section[aria-label="Misiones de video"]{background:#ffffff!important;color:#304b65!important;border:1px solid #e5edf4!important;box-shadow:0 8px 30px rgba(52,100,139,.045)!important}
      .atlas-fabrica-videos section[aria-label="Misiones de video"] button{background:#edf8ff;color:#12648f;border:1px solid #c9e6f5;border-radius:9px;padding:7px 12px;cursor:pointer;margin:4px}
      .atlas-fabrica-videos section[aria-label="Misiones de video"] p[role="alert"]{color:#b42318!important}
      @media(max-width:850px){.atlas-fabrica-videos .factory-columns{grid-template-columns:1fr}.atlas-fabrica-videos .genre-grid{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:520px){.atlas-fabrica-videos .genre-grid{grid-template-columns:repeat(2,1fr)}.atlas-fabrica-videos .field-grid{grid-template-columns:1fr}}
    `}</style>
    <header style={{display:'flex',alignItems:'center',gap:16,margin:'0 auto 28px',maxWidth:1220,padding:'2px 2px 12px'}}>
      <div style={{width:58,height:58,borderRadius:19,background:'linear-gradient(145deg,#a5e1fb,#dcf3ff)',color:'#0871a8',display:'grid',placeItems:'center',boxShadow:'0 8px 22px rgba(50,147,200,.12)',border:'1px solid #c1e8f9'}}><Clapperboard size={28} strokeWidth={1.75}/></div>
      <div>
        <div style={{fontSize:11,fontWeight:750,letterSpacing:'.12em',color:'#69a6c5',marginBottom:5}}>ESTUDIO CREATIVO</div>
        <h1 style={{fontSize:'clamp(25px,3vw,34px)',lineHeight:1.18,margin:0,fontWeight:720,letterSpacing:'-.035em',color:'#17334b'}}>ATLAS — Fábrica de Videos</h1>
        <p style={{margin:'7px 0 0',color:'#73889b',fontSize:14}}>Una sola entrada para cualquier género, historia y duración</p>
      </div>
    </header>
    {liveRunningMission&&(()=>{
      const {pct,remSec,stepIdx,isStalled,staleMin,steps}=computeLiveMissionProgress(liveRunningMission,tickSec);
      return <div role="region" aria-label="Progreso de producción en vivo superior" style={{maxWidth:1220,margin:'0 auto 22px',border:isStalled?'1.5px solid #f59e0b':'1px solid #38bdf8',background:isStalled?'linear-gradient(180deg,#fffbeb 0%,#fef3c7 100%)':'linear-gradient(180deg,#f0f9ff 0%,#e0f2fe 100%)',padding:'16px 20px',borderRadius:16,boxShadow:isStalled?'0 8px 24px rgba(245,158,11,0.16)':'0 8px 24px rgba(14,165,233,0.14)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:8,flexWrap:'wrap'}}>
          <div style={{fontSize:14.5,fontWeight:750,color:isStalled?'#92400e':'#0c4a6e'}}>
            {isStalled?'⏸️ Sesión de Google Colab en espera / pausa (activar Play en GPU L4/T4 + RAM Alta): ':'🎬 Produciendo en vivo en Google Colab: '}{liveRunningMission.title||liveRunningMission.missionId}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span style={{background:isStalled?'#d97706':'#0284c7',color:'#fff',fontWeight:750,fontSize:12,padding:'4px 11px',borderRadius:999}}>{pct}%</span>
            <span style={{background:'#ffffff',border:isStalled?'1px solid #fcd34d':'1px solid #bae6fd',color:isStalled?'#92400e':'#0369a1',fontWeight:650,fontSize:12,padding:'4px 11px',borderRadius:999}}>
              {isStalled?`⚠️ Sin latido hace ${staleMin} min`:`⏱️ ${formatRemainingTime(remSec)}`}
            </span>
          </div>
        </div>
        <div style={{width:'100%',height:14,background:'#cbd5e1',borderRadius:999,overflow:'hidden',marginBottom:10,boxShadow:'inset 0 1px 3px rgba(0,0,0,0.12)'}}>
          <div style={{width:`${pct}%`,height:'100%',background:isStalled?'linear-gradient(90deg,#f59e0b 0%,#fbbf24 100%)':'linear-gradient(90deg,#0284c7 0%,#10b981 55%,#38bdf8 100%)',borderRadius:999,transition:'width 0.8s ease'}}/>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:10}}>
          <div style={{fontSize:12.5,color:isStalled?'#92400e':'#075985',fontWeight:550}}>
            {liveRunningMission.detail||'Procesando automáticamente en Google Colab ($0.00)…'}
          </div>
          {learningSummary?.colabWorkerCellCmd&&<div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            <button type="button" className="factory-secondary" style={{fontSize:11.5,padding:'5px 11px',background:'#0f172a',borderColor:'#38bdf8',color:'#f8fafc',fontWeight:750}} onClick={()=>{
              const nb={nbformat:4,nbformat_minor:0,metadata:{colab:{provenance:[],gpuType:'L4',machine_shape:'hm'},accelerator:'GPU',gpuClass:'premium',kernelspec:{name:'python3',display_name:'Python 3'}},cells:[{cell_type:'markdown',metadata:{},source:['# 🚀 ATLAS Video Factory — Worker GPU L4/T4 + RAM Alta\n','Preconfigurado con **`machine_shape: hm` (RAM Alta · 8–12 vCPUs + ~51 GB RAM)** y **GPU (`L4` / `T4` `h264_nvenc`)**.\n','- Ejecutá **únicamente la celda de abajo** (`▶ Play`).']},{cell_type:'code',execution_count:null,metadata:{},outputs:[],source:[learningSummary.colabWorkerCellCmd]}]};
              const blob=new Blob([JSON.stringify(nb,null,2)],{type:'application/x-ipynb+json'});
              const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ATLAS_Colab_GPU_RAM_Alta_V6.ipynb';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
              setFeedbackStatus('Notebook GPU L4 + RAM Alta descargado. Abrilo en Google Colab (Archivo → Subir cuaderno).');
            }}>
              <Download size={12} style={{verticalAlign:'middle',marginRight:5}}/>Notebook GPU + RAM Alta (.ipynb)
            </button>
            {isStalled&&<button type="button" className="factory-secondary" style={{fontSize:11.5,padding:'5px 11px',background:'#ffffff',borderColor:'#f59e0b',color:'#92400e',fontWeight:700}} onClick={async()=>{try{await navigator.clipboard.writeText(learningSummary.colabWorkerCellCmd!);setFeedbackStatus('Comando GPU Colab copiado.');}catch{}}}>
              <Copy size={12} style={{verticalAlign:'middle',marginRight:5}}/>Copiar comando 1 celda Colab GPU
            </button>}
          </div>}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,minmax(0,1fr))',gap:6}}>
          {steps.map((label,idx)=>{
            const done=(idx+1)<stepIdx;
            const active=(idx+1)===stepIdx;
            return <div key={label} style={{fontSize:10.5,textAlign:'center',padding:'5px 4px',borderRadius:8,fontWeight:active?750:600,background:done?'#d1fae5':active?(isStalled?'#d97706':'#0284c7'):'#ffffff',color:done?'#065f46':active?'#ffffff':'#64748b',border:done?'1px solid #6ee7b7':active?(isStalled?'1px solid #b45309':'1px solid #0369a1'):'1px solid #cbd5e1'}}>
              {done?'✓ ':''}{label}
            </div>;
          })}
        </div>
      </div>;
    })()}
    <div className="factory-columns">
      <form onSubmit={prepare} style={{...cardStyle,display:'flex',flexDirection:'column',gap:21}}>
        <div style={{border:'2px solid #4f46e5',background:'linear-gradient(135deg,#eef2ff 0%,#f5f3ff 55%,#ecfeff 100%)',borderRadius:16,padding:16,boxShadow:'0 8px 24px rgba(79,70,229,0.12)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:10}}>
            <div style={{display:'flex',alignItems:'center',gap:9}}>
              <span style={{fontSize:22}}>💬</span>
              <div>
                <div style={{fontSize:14.5,fontWeight:850,color:'#1e1b4b'}}>
                  Chat Conversacional con el Director ATLAS + Argon 4 (Ida y Vuelta con Memoria)
                </div>
                <div style={{fontSize:11.5,color:'#4338ca'}}>
                  Armá videos, editá un bloque puntual, auditá el último video entregado o mandá a producir hablando en lenguaje natural.
                </div>
              </div>
            </div>
            <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
              <button
                type="button"
                onClick={()=>setDirectorChatEngine(directorChatEngine==='argon4'?'gemini':'argon4')}
                style={{fontSize:10.5,fontWeight:800,padding:'5px 10px',borderRadius:999,background:directorChatEngine==='argon4'?'#312e81':'#0f766e',color:'#ffffff',border:'none',cursor:'pointer'}}
              >
                {directorChatEngine==='argon4'
                  ? '🧠 Motor Prioritario: Argon 4 (Gemma 4 26B) + Gemini ($0.00)'
                  : '⚡ Motor Prioritario: Gemini 2.5/3 Flash + Argon 4 ($0.00)'}
              </button>
              {directorChatMessages.length > 1 && (
                <button
                  type="button"
                  onClick={()=>setDirectorChatMessages([directorChatMessages[0]])}
                  style={{fontSize:10.5,fontWeight:750,padding:'4px 9px',borderRadius:999,background:'#ffffff',color:'#475569',border:'1px solid #cbd5e1',cursor:'pointer'}}
                >
                  🗑️ Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Historial de Conversación Multi-Turno */}
          <div style={{maxHeight:240,overflowY:'auto',display:'flex',flexDirection:'column',gap:8,padding:10,borderRadius:12,background:'#ffffff',border:'1px solid #c7d2fe',marginBottom:10}}>
            {directorChatMessages.map((msg, mIdx) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={mIdx}
                  style={{
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '90%',
                    padding: '9px 12px',
                    borderRadius: isUser ? '13px 13px 3px 13px' : '13px 13px 13px 3px',
                    background: isUser ? '#4f46e5' : '#f8fafc',
                    color: isUser ? '#ffffff' : '#0f172a',
                    border: isUser ? '1px solid #4338ca' : '1px solid #e2e8f0',
                    fontSize: 12.5,
                    lineHeight: 1.45
                  }}
                >
                  <div style={{display:'flex',justifyContent:'space-between',gap:8,fontSize:10,fontWeight:800,marginBottom:3,opacity:0.85}}>
                    <span>{isUser ? '👤 VOS (DIRECTOR)' : '🎬 ATLAS + ARGON 4'}</span>
                    <span>{msg.at}</span>
                  </div>
                  <div style={{whiteSpace:'pre-wrap',fontWeight:isUser?600:650}}>{msg.text}</div>
                  {msg.advisory && (
                    <div style={{marginTop:5,padding:'4px 8px',borderRadius:7,background:'#eef2ff',color:'#3730a3',fontSize:11,fontWeight:700}}>
                      ✦ {msg.advisory}
                    </div>
                  )}
                  {msg.model && !isUser && (
                    <div style={{marginTop:4,fontSize:10,color:'#6366f1',fontWeight:700}}>
                      Motor: {msg.model}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Botones Rápidos de Conversación / Acciones Argon 4 */}
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:9}}>
            {[
              { label: '🔍 Auditame el último video entregado', prompt: 'Auditame el último video entregado y decime qué resolución, música, fuentes y QA tuvo' },
              { label: '✏️ Mejorá solo el Bloque 3', prompt: 'Mejorá únicamente el bloque 3 para que sea más épico y cinematográfico sin tocar los demás bloques' },
              { label: '🖥️ Pasalo a Horizontal 16:9', prompt: 'Pasá este mismo proyecto a formato horizontal 16:9 con voz de narrador documental' },
              { label: '🏔️ Documental Glaciares Patagonia', prompt: 'Haceme un documental horizontal de 60s sobre los Glaciares de la Patagonia con narrador documental' },
              { label: '⚽ Informe Deportivo Messi', prompt: 'Armá un informe deportivo vertical de 60s sobre Messi y la Selección Argentina con relator dinámico' }
            ].map((chip, sIdx) => (
              <button
                key={sIdx}
                type="button"
                onClick={()=>setDirectorChatPrompt(chip.prompt)}
                style={{background:'#ffffff',color:'#3730a3',border:'1px solid #c7d2fe',borderRadius:999,padding:'4px 10px',fontSize:11,fontWeight:750,cursor:'pointer'}}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <textarea
            value={directorChatPrompt}
            onChange={e=>setDirectorChatPrompt(e.target.value)}
            onKeyDown={e=>{
              if(e.key==='Enter' && !e.shiftKey){
                e.preventDefault();
                if(!interpretingChatPrompt) handleDirectorChatPrompt(false);
              }
            }}
            placeholder='Escribí acá tu mensaje para Argon 4 / ATLAS (Enter para enviar · Shift+Enter para salto de línea)… Ej: "Cambiá el bloque 2", "Auditame el último video" o "Haceme un documental de René Favaloro"'
            style={{...inputStyle,minHeight:64,background:'#ffffff',border:'1.5px solid #a5b4fc',fontSize:13,marginBottom:9}}
          />

          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            <button
              type="button"
              disabled={interpretingChatPrompt}
              onClick={()=>handleDirectorChatPrompt(false)}
              style={{flex:1,minWidth:210,background:'#4f46e5',color:'#ffffff',border:'1px solid #4338ca',borderRadius:11,padding:'10px 14px',fontWeight:800,fontSize:13,cursor:interpretingChatPrompt?'wait':'pointer',boxShadow:'0 3px 10px rgba(79,70,229,0.22)'}}
            >
              {interpretingChatPrompt ? '⏳ Argon 4 respondiendo…' : '💬 Enviar al Chat (Conversar / Ajustar / Auditar)'}
            </button>
            <button
              type="button"
              disabled={interpretingChatPrompt}
              onClick={()=>handleDirectorChatPrompt(true)}
              style={{flex:1,minWidth:210,background:'linear-gradient(180deg,#059669,#047857)',color:'#ffffff',border:'1px solid #065f46',borderRadius:11,padding:'10px 14px',fontWeight:800,fontSize:13,cursor:interpretingChatPrompt?'wait':'pointer',boxShadow:'0 3px 10px rgba(5,150,105,0.24)'}}
            >
              {interpretingChatPrompt ? '⏳ Procesando…' : '🚀 Enviar y Producir Directo (1080p Full HD)'}
            </button>
          </div>
        </div>
        {(()=>{
          const currentList = allParallelMissions();
          return <div style={{border:'1px solid #a7f3d0',background:'linear-gradient(180deg,#ecfdf5 0%,#f0fdf4 100%)',borderRadius:16,padding:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap',marginBottom:10}}>
              <div>
                <div style={{fontSize:13,fontWeight:800,color:'#065f46'}}>
                  ⚡ Producción Multitarea en Paralelo ({currentList.length} de 5 Misiones a la Vez)
                </div>
                <div style={{fontSize:11.5,color:'#047857',marginTop:2}}>
                  Configurá <strong>Misión 1</strong> (ej. Documental), hacé clic en <strong>＋ Agregar Misión 2</strong> (ej. Informe deportivo) y envialas todas juntas para renderizarlas al mismo tiempo en Google Colab.
                </div>
              </div>
              {currentList.length < 5 && (
                <button
                  type="button"
                  onClick={()=>addAnotherParallelMission()}
                  style={{background:'#059669',color:'#ffffff',border:'1px solid #047857',borderRadius:10,padding:'8px 13px',fontWeight:750,fontSize:12,cursor:'pointer',whiteSpace:'nowrap',boxShadow:'0 2px 8px rgba(5,150,105,0.2)'}}
                >
                  ＋ Agregar Misión #{currentList.length + 1} en Paralelo
                </button>
              )}
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {currentList.map((m, idx) => {
                const isActive = idx === activeDraftIdx;
                const gName = m.genre === 'Otro' ? (m.customGenre || 'Otro') : m.genre;
                const icon = genreIcons[m.genre] || '🎬';
                const vObj = elevenLabsSpanishVoices.find(v => v.id === m.selectedElevenVoiceId);
                const vShort = vObj ? vObj.name.split(' ')[0] : 'Pipilin';
                return (
                  <div
                    key={idx}
                    onClick={()=>switchParallelTab(idx)}
                    style={{
                      display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:11,cursor:'pointer',
                      border:isActive?'2px solid #059669':'1px solid #a7f3d0',
                      background:isActive?'#ffffff':'#d1fae5',
                      color:'#064e3b',
                      boxShadow:isActive?'0 3px 10px rgba(5,150,105,0.12)':'none'
                    }}
                  >
                    <div>
                      <div style={{fontSize:12,fontWeight:800,color:isActive?'#047857':'#065f46'}}>
                        {isActive ? '● ' : ''}{icon} Misión #{idx + 1}: {gName}
                      </div>
                      <div style={{fontSize:10.5,color:'#047857',maxWidth:170,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {m.subject.trim() || m.script.trim() || 'Sin tema aún'} · 🎙️ {vShort} · {m.seconds || '60'}s
                      </div>
                    </div>
                    {currentList.length > 1 && (
                      <button
                        type="button"
                        title={`Quitar Misión #${idx + 1}`}
                        onClick={e=>{e.stopPropagation();removeParallelMissionAt(idx);}}
                        style={{background:'#fee2e2',color:'#b91c1c',border:'1px solid #fecaca',borderRadius:6,padding:'2px 6px',fontSize:10.5,fontWeight:750,cursor:'pointer'}}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {currentList.length < 5 && (
              <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',marginTop:10,paddingTop:8,borderTop:'1px dashed #6ee7b7'}}>
                <span style={{fontSize:11,fontWeight:700,color:'#065f46'}}>Agregar rápido como Misión #{currentList.length + 1}:</span>
                {['Documental', 'Informe deportivo', 'Humor', 'Informe periodístico', 'Educativo', 'Biografía'].map(quickG => (
                  <button
                    key={quickG}
                    type="button"
                    onClick={()=>addAnotherParallelMission(quickG)}
                    style={{background:'#ffffff',color:'#047857',border:'1px solid #6ee7b7',borderRadius:8,padding:'4px 9px',fontSize:11,fontWeight:700,cursor:'pointer'}}
                  >
                    ＋ {genreIcons[quickG]} {quickG}
                  </button>
                ))}
              </div>
            )}
          </div>;
        })()}
        <section><div style={labelStyle}>1. ¿Qué tipo de video querés crear? {parallelDrafts.length > 1 ? `(Editando Misión #${activeDraftIdx + 1} de ${parallelDrafts.length})` : ''}</div>
          <div className="genre-grid">{genres.map(g=><button className="genre-btn" key={g} type="button" aria-pressed={genre===g} onClick={()=>{setGenre(g);if(g==='Humor')setVideoMixMode('raw');setPrepared(null);}}><span style={{fontSize:21}}>{genreIcons[g]}</span><span>{g}</span></button>)}</div>
          {genre==='Humor' && (
            <div style={{marginTop:10,padding:'10px 13px',borderRadius:12,background:'#fef3c7',border:'1px solid #f59e0b',color:'#78350f',fontSize:12,lineHeight:1.4}}>
              <strong>🎭 Modo Mix de Sketches Divertidos Activo:</strong> Al elegir <strong>Humor</strong>, ATLAS <strong>nunca</strong> hace estilo biografía ni documental enciclopédico. Busca automáticamente <strong>3 a 4 videos distintos de sketches graciosos del personaje</strong> y los mezcla conservando sus voces cómicas, chistes, remates y risas originales.
            </div>
          )}
          {genre==='Otro' && <div style={{marginTop:12}}><label htmlFor="factory-other" style={labelStyle}>Nombre del género</label><input id="factory-other" value={customGenre} onChange={e=>setCustomGenre(e.target.value)} placeholder="Ej. misterio, ciencia ficción, viajes..." style={inputStyle} maxLength={100}/></div>}
        </section>
        <section><label htmlFor="factory-subject" style={labelStyle}>2. Decile a ATLAS qué querés hacer</label>
          <input id="factory-subject" value={subject} onChange={e=>setSubject(e.target.value)} placeholder={genre==='Humor' ? 'Ej. Sketches divertidos de Guillermo Francella / Capusotto / El Chavo / Mr. Bean' : 'Ej. Un informe deportivo sobre Boca y River de hoy'} style={inputStyle} maxLength={500}/>
        </section>
        <div className="field-grid">
          <div><label htmlFor="factory-seconds" style={labelStyle}>Duración (segundos)</label><input id="factory-seconds" type="number" min="10" max="7200" step="1" value={seconds} onChange={e=>setSeconds(e.target.value)} style={inputStyle}/></div>
          <div><label htmlFor="factory-count" style={labelStyle}>Cantidad de videos</label><input id="factory-count" type="number" min="1" max="100" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)} style={inputStyle}/></div>
          <div><label htmlFor="factory-format" style={labelStyle}>Formato</label><select id="factory-format" value={format} onChange={e=>setFormat(e.target.value as Format)} style={inputStyle}><option value="vertical">Vertical (9:16)</option><option value="horizontal">Horizontal (16:9)</option><option value="cuadrado">Cuadrado (1:1)</option></select></div>
        </div>
        <div><label htmlFor="factory-script" style={labelStyle}>3. Guion (opcional)</label><textarea id="factory-script" value={script} onChange={e=>setScript(e.target.value)} placeholder="Pegá el guion completo. Si no tenés, dejalo vacío para pedir que ATLAS lo elabore." style={inputStyle}/></div>
        <div style={{border:'1px solid #bae6fd',background:'linear-gradient(180deg,#f8fcff 0%,#f0f9ff 100%)',borderRadius:16,padding:16}}>
          <label htmlFor="factory-references" style={{...labelStyle,color:'#0369a1',marginBottom:6}}>
            4. Subir Video(s) desde tu PC / Celular o Mandar URL(s) — Armar un video con este material
          </label>
          <div style={{fontSize:12,color:'#475569',marginBottom:10}}>
            Subí directamente uno o varios videos desde tu computadora o la galería de tu celular (`.mp4`, `.mov`, `.webm`), o pegá links de YouTube (`watch`, `shorts`, `youtu.be`). Elegí abajo cómo querés producirlos:
          </div>
          <div role="radiogroup" aria-label="Modo de mezcla de videos" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:8,marginBottom:12}}>
            <button
              type="button"
              onClick={()=>setVideoMixMode('atlas')}
              style={{textAlign:'left',padding:'10px 12px',borderRadius:12,cursor:'pointer',border:videoMixMode==='atlas'?'2px solid #0284c7':'1px solid #cbd5e1',background:videoMixMode==='atlas'?'#e0f2fe':'#ffffff',color:'#0f172a'}}
            >
              <div style={{fontWeight:750,fontSize:12.5,color:videoMixMode==='atlas'?'#0369a1':'#1e293b',marginBottom:3}}>
                {videoMixMode==='atlas'?'● ':'○ '}🎙️ Modo 1: Producción ATLAS (El que está)
              </div>
              <div style={{fontSize:11.5,color:'#475569',lineHeight:1.35}}>
                Montaje dinámico de 12 cortes con locución IA en español, música de fondo según estilo y gráfica de TV.
              </div>
            </button>
            <button
              type="button"
              onClick={()=>setVideoMixMode('raw')}
              style={{textAlign:'left',padding:'10px 12px',borderRadius:12,cursor:'pointer',border:videoMixMode==='raw'?'2px solid #0d9488':'1px solid #cbd5e1',background:videoMixMode==='raw'?'#ccfbf1':'#ffffff',color:'#0f172a'}}
            >
              <div style={{fontWeight:750,fontSize:12.5,color:videoMixMode==='raw'?'#0f766e':'#1e293b',marginBottom:3}}>
                {videoMixMode==='raw'?'● ':'○ '}🎬 Modo 2: Crudo / Fusión Coherente (Sin más)
              </div>
              <div style={{fontSize:11.5,color:'#475569',lineHeight:1.35}}>
                Une los videos en orden continuo respetando su coherencia y su audio original (de 2 o más videos hace 1 solo, sin voz IA ni zócalos).
              </div>
            </button>
            <button
              type="button"
              onClick={()=>setVideoMixMode('recreate')}
              style={{textAlign:'left',padding:'10px 12px',borderRadius:12,cursor:'pointer',border:videoMixMode==='recreate'?'2px solid #7c3aed':'1px solid #cbd5e1',background:videoMixMode==='recreate'?'#f3e8ff':'#ffffff',color:'#0f172a'}}
            >
              <div style={{fontWeight:750,fontSize:12.5,color:videoMixMode==='recreate'?'#6d28d9':'#1e293b',marginBottom:3}}>
                {videoMixMode==='recreate'?'● ':'○ '}🔄 Modo 3: Hacerlo igual pero con OTROS videos e imágenes
              </div>
              <div style={{fontSize:11.5,color:'#475569',lineHeight:1.35}}>
                Toma el tema y la historia de la URL que pegaste, pero NO usa ese video: busca otros videos HD, otros fotogramas y otras fotos distintas.
              </div>
            </button>
            <button
              type="button"
              onClick={()=>setVideoMixMode('remaster')}
              style={{textAlign:'left',padding:'10px 12px',borderRadius:12,cursor:'pointer',border:videoMixMode==='remaster'?'2px solid #d97706':'1px solid #cbd5e1',background:videoMixMode==='remaster'?'#fef3c7':'#ffffff',color:'#0f172a'}}
            >
              <div style={{fontWeight:750,fontSize:12.5,color:videoMixMode==='remaster'?'#b45309':'#1e293b',marginBottom:3}}>
                {videoMixMode==='remaster'?'● ':'○ '}✨ Modo 4: Remasterizar HD 1080p ($0.00)
              </div>
              <div style={{fontSize:11.5,color:'#475569',lineHeight:1.35}}>
                Sube a Full HD 1080p con Lanczos + realce de bordes CAS + limpieza de ruido visual hqdn3d + limpieza espectral de audio afftdn ($0.00).
              </div>
            </button>
            <button
              type="button"
              onClick={()=>setVideoMixMode('remaster_4k')}
              style={{textAlign:'left',padding:'10px 12px',borderRadius:12,cursor:'pointer',border:videoMixMode==='remaster_4k'?'2px solid #4f46e5':'1px solid #cbd5e1',background:videoMixMode==='remaster_4k'?'#e0e7ff':'#ffffff',color:'#0f172a'}}
            >
              <div style={{fontWeight:750,fontSize:12.5,color:videoMixMode==='remaster_4k'?'#4338ca':'#1e293b',marginBottom:3}}>
                {videoMixMode==='remaster_4k'?'● ':'○ '}💎 Modo 5: Remasterizar 4K Ultra HD 2160p ($0.00)
              </div>
              <div style={{fontSize:11.5,color:'#475569',lineHeight:1.35}}>
                Super-escalado Ultra HD 4K (3840×2160 / 2160×3840) con Lanczos + CAS + limpieza hqdn3d + audio Studio afftdn 100% gratis en Colab ($0.00).
              </div>
            </button>
          </div>
          <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
            <label
              style={{
                display:'inline-flex',
                alignItems:'center',
                gap:8,
                background:uploadingMedia?'#94a3b8':'linear-gradient(135deg,#0284c7 0%,#0369a1 100%)',
                color:'#ffffff',
                padding:'10px 16px',
                borderRadius:11,
                fontWeight:750,
                fontSize:12.5,
                cursor:uploadingMedia?'wait':'pointer',
                boxShadow:'0 2px 6px rgba(2,132,199,0.25)',
                whiteSpace:'nowrap'
              }}
            >
              <span>{uploadingMedia?'⏳ Subiendo a la nube…':'📂 Subir video(s) desde mi PC / Celular'}</span>
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/*,.mp4,.mov,.webm,.mkv"
                multiple
                disabled={uploadingMedia}
                onChange={e=>{handleUploadFilesFromDevice(e.target.files,'references');e.target.value='';}}
                style={{display:'none'}}
              />
            </label>
            <input
              type="url"
              value={newVideoUrl}
              onChange={e=>setNewVideoUrl(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addVideoUrlToList();}}}
              placeholder="O pegá un link https://www.youtube.com/watch?v=... (presioná Agregar)"
              style={{...inputStyle,flex:'1 1 220px',padding:'10px 12px'}}
            />
            <button type="button" className="factory-secondary" onClick={addVideoUrlToList} style={{whiteSpace:'nowrap',fontWeight:700}}>
              ＋ Agregar URL
            </button>
          </div>
          {uploadStatusMsg&&<div style={{marginBottom:10,padding:'8px 12px',borderRadius:10,fontSize:12,fontWeight:700,background:uploadStatusMsg.startsWith('❌')?'#fef2f2':uploadStatusMsg.startsWith('✅')?'#f0fdf4':'#eff6ff',border:uploadStatusMsg.startsWith('❌')?'1px solid #fecaca':uploadStatusMsg.startsWith('✅')?'1px solid #bbf7d0':'1px solid #bfdbfe',color:uploadStatusMsg.startsWith('❌')?'#991b1b':uploadStatusMsg.startsWith('✅')?'#166534':'#1e40af'}}>
            {uploadStatusMsg}
          </div>}
          {parsedVideoUrls.length>0&&<div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:10}}>
            <div style={{background:videoMixMode==='remaster_4k'?'#e0e7ff':videoMixMode==='remaster'?'#fef3c7':videoMixMode==='raw'?'#ccfbf1':videoMixMode==='recreate'?'#f3e8ff':'#e0f2fe',border:videoMixMode==='remaster_4k'?'1px solid #a5b4fc':videoMixMode==='remaster'?'1px solid #fcd34d':videoMixMode==='raw'?'1px solid #5eead4':videoMixMode==='recreate'?'1px solid #d8b4fe':'1px solid #7dd3fc',color:videoMixMode==='remaster_4k'?'#312e81':videoMixMode==='remaster'?'#92400e':videoMixMode==='raw'?'#134e4a':videoMixMode==='recreate'?'#581c87':'#0c4a6e',padding:'8px 12px',borderRadius:10,fontSize:12,fontWeight:700}}>
              {videoMixMode==='remaster_4k'
                ? `💎 Modo Remasterizar 4K Ultra HD 2160p Activo (${parsedVideoUrls.length} video${parsedVideoUrls.length===1?'':'s'} · $0.00): Se mejorará a 4K Ultra HD (3840×2160 / 2160×3840) con Lanczos + CAS + hqdn3d + limpieza de audio afftdn.`
                : videoMixMode==='remaster'
                  ? `✨ Modo Remasterizar HD 1080p Activo (${parsedVideoUrls.length} video${parsedVideoUrls.length===1?'':'s'} · $0.00): Se mejorará a Full HD 1080p (Lanczos + CAS + hqdn3d) y su audio original será limpiado espectralmente (afftdn + EQ Studio + Loudnorm).`
                  : videoMixMode==='raw'
                    ? `🎬 Modo Crudo Activo (${parsedVideoUrls.length} video${parsedVideoUrls.length===1?'':'s'}): Se unirán en orden exacto (Video #1 → #2…) con su audio original normalizado, sin voz IA ni placas.`
                    : videoMixMode==='recreate'
                      ? `🔄 Modo Recrear con Otras Fuentes Activo (${parsedVideoUrls.length} referencia${parsedVideoUrls.length===1?'':'s'}): ATLAS tomará el tema e historia de este link, descartará el video original y buscará OTROS videos HD, otros fotogramas y otras fotos sobre el mismo tema.`
                      : `🎯 Modo Producción ATLAS Activo (${parsedVideoUrls.length} video${parsedVideoUrls.length===1?'':'s'}): ATLAS armará los 12 cortes, locución IA y música usando prioritariamente estos videos.`}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:8}}>
              {parsedVideoUrls.map((u,idx)=>{
                const ytM=u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                const ytId=ytM?ytM[1]:null;
                const localLabel=uploadedFileLabels[u];
                const isSupabaseUpload=Boolean(localLabel)||u.includes('/atlas-private-video-shares/user-uploads/');
                return <div key={u} style={{display:'flex',alignItems:'center',gap:8,background:'#ffffff',border:'1px solid #cbd5e1',borderRadius:10,padding:'6px 10px',fontSize:12}}>
                  {ytId&&<img src={`https://i.ytimg.com/vi/${ytId}/default.jpg`} alt="" style={{width:48,height:36,objectFit:'cover',borderRadius:6,flexShrink:0}}/>}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,color:'#0f172a'}}>
                      {ytId
                        ? `▶️ Video #${idx+1} · YouTube (${ytId})`
                        : isSupabaseUpload
                          ? `📱 Video #${idx+1} · Subido desde tu dispositivo`
                          : `🎞️ Video #${idx+1} · Enlace Directo`}
                    </div>
                    <div style={{color:'#64748b',fontSize:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {localLabel || u}
                    </div>
                  </div>
                  <button type="button" onClick={()=>removeVideoUrlFromList(u)} title="Quitar video" style={{background:'#fee2e2',color:'#b91c1c',border:'1px solid #fecaca',borderRadius:7,padding:'4px 8px',cursor:'pointer',fontWeight:700,fontSize:11}}>
                    ✕
                  </button>
                </div>;
              })}
            </div>
          </div>}
          <textarea id="factory-references" value={references} onChange={e=>setReferences(e.target.value)} placeholder="También podés pegar varias URLs juntas acá (una por línea)…" style={{...inputStyle,minHeight:64,fontSize:12}}/>
        </div>
        <div style={{border:'2px solid #f59e0b',background:'linear-gradient(180deg,#fffbeb 0%,#fef3c7 100%)',borderRadius:16,padding:16}}>
          <div style={{...labelStyle,color:'#92400e',marginBottom:4,fontSize:14,fontWeight:800}}>
            🍽️ 4-B. Armar el Video a la Carta + Kit Plan Google AI Ultra (1. Música · 2. Guion sin Voz · 3. Imagen/Video · 4. Voz Propia/Ultra)
          </div>
          <div style={{fontSize:12,color:'#78350f',marginBottom:12,lineHeight:1.45}}>
            Acá podés armar tu video <strong>a medida combinando piezas de distintas URLs o de tu Plan Google AI Ultra</strong>: podés sacar <strong>1. solo la música</strong>, <strong>2. solo el guion sin voz</strong>, <strong>3. solo las imágenes/videos mudos</strong> (incluyendo clips de <strong>Google Veo 3 / Flow</strong>) y <strong>4. tu propia voz o locución de NotebookLM Plus / Gemini Ultra</strong>.
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(255px,1fr))',gap:12}}>
            {/* Opción 1: Música */}
            <div style={{background:'#ffffff',border:alacarteMusicUrl.trim()?'2px solid #d97706':'1px solid #fcd34d',borderRadius:13,padding:12}}>
              <div style={{fontWeight:800,fontSize:12.5,color:'#92400e',marginBottom:4}}>
                🎵 1. MÚSICA (Extraer solo la música)
              </div>
              <div style={{fontSize:11.5,color:'#475569',marginBottom:8,lineHeight:1.35}}>
                Pegá la URL de una canción o video (YouTube o archivo) y ATLAS extraerá <strong>únicamente la pista musical</strong> para el fondo del video.
              </div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:6}}>
                <input
                  type="url"
                  value={alacarteMusicUrl}
                  onChange={e=>setAlacarteMusicUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... (URL de música)"
                  style={{...inputStyle,padding:'9px 11px',fontSize:12,flex:'1 1 160px'}}
                />
                <label style={{display:'inline-flex',alignItems:'center',gap:4,background:'#d97706',color:'#ffffff',padding:'8px 11px',borderRadius:9,fontWeight:750,fontSize:11.5,cursor:uploadingMedia?'wait':'pointer',whiteSpace:'nowrap'}}>
                  <span>📂 Subir Audio</span>
                  <input
                    type="file"
                    accept="audio/*,video/*,.mp3,.wav,.m4a,.ogg,.mp4,.webm"
                    disabled={uploadingMedia}
                    onChange={e=>{handleUploadFilesFromDevice(e.target.files,'alacarte_music');e.target.value='';}}
                    style={{display:'none'}}
                  />
                </label>
              </div>
              {alacarteMusicUrl.trim()&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:6,background:'#fef3c7',border:'1px solid #f59e0b',color:'#92400e',padding:'6px 9px',borderRadius:8,fontSize:11,fontWeight:700}}>
                <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>✅ Extraer música de: {uploadedFileLabels[alacarteMusicUrl.trim()]||alacarteMusicUrl.trim()}</span>
                <button type="button" onClick={()=>setAlacarteMusicUrl('')} style={{background:'#fee2e2',color:'#991b1b',border:'none',borderRadius:6,padding:'2px 7px',cursor:'pointer',fontWeight:800}}>✕</button>
              </div>}
            </div>

            {/* Opción 2: Guion sin voz */}
            <div style={{background:'#ffffff',border:(alacarteScriptUrl.trim()||alacarteNoVoice)?'2px solid #0284c7':'1px solid #fcd34d',borderRadius:13,padding:12}}>
              <div style={{fontWeight:800,fontSize:12.5,color:'#0369a1',marginBottom:4}}>
                📝 2. GUION SIN VOZ (La voz después la ponemos nosotros)
              </div>
              <div style={{fontSize:11.5,color:'#475569',marginBottom:8,lineHeight:1.35}}>
                Pegá una URL y ATLAS extrae <strong>solo el guion</strong> (descartando la voz original). Podés dejar el video <strong>sin locución</strong> para grabarle o ponerle la voz después.
              </div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
                <input
                  type="url"
                  value={alacarteScriptUrl}
                  onChange={e=>{
                    setAlacarteScriptUrl(e.target.value);
                    if(e.target.value.trim())setAlacarteNoVoice(true);
                  }}
                  placeholder="https://www.youtube.com/watch?v=... (URL para extraer guion)"
                  style={{...inputStyle,padding:'9px 11px',fontSize:12,flex:'1 1 150px'}}
                />
                <button
                  type="button"
                  disabled={extractingScript}
                  onClick={handleExtractScriptFromUrl}
                  style={{background:'#0284c7',color:'#ffffff',border:'none',borderRadius:9,padding:'8px 11px',fontWeight:750,fontSize:11.5,cursor:extractingScript?'wait':'pointer',whiteSpace:'nowrap'}}
                >
                  {extractingScript?'⏳ Extrayendo…':'📥 Extraer Guion Ahora'}
                </button>
              </div>
              <label style={{display:'flex',alignItems:'flex-start',gap:7,background:alacarteNoVoice?'#e0f2fe':'#f8fafc',border:alacarteNoVoice?'1px solid #38bdf8':'1px solid #cbd5e1',borderRadius:9,padding:'7px 9px',cursor:'pointer',fontSize:11.5,fontWeight:700,color:'#0c4a6e'}}>
                <input
                  type="checkbox"
                  checked={alacarteNoVoice}
                  onChange={e=>setAlacarteNoVoice(e.target.checked)}
                  style={{marginTop:2}}
                />
                <span>🔇 <strong>Producir SIN VOZ IA</strong> (El video sale con Música + Imágenes y el guion separado en 6 bloques para que la voz la pongamos nosotros después)</span>
              </label>
              {extractScriptStatus&&<div style={{marginTop:6,fontSize:11,fontWeight:700,color:extractScriptStatus.startsWith('❌')?'#991b1b':'#0369a1'}}>
                {extractScriptStatus}
              </div>}
            </div>

            {/* Opción 3: Imagen / Video */}
            <div style={{background:'#ffffff',border:parsedAlacarteVisualUrls.length>0?'2px solid #059669':'1px solid #fcd34d',borderRadius:13,padding:12}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:6,marginBottom:4}}>
                <div style={{fontWeight:800,fontSize:12.5,color:'#065f46'}}>
                  🖼️ 3. IMAGEN / VIDEO (Subir y Ordenar todas tus Tarjetas de `Google Flow` / Clips)
                </div>
                {parsedAlacarteVisualUrls.length>1&&(
                  <button
                    type="button"
                    onClick={autoSortFlowVisualCards}
                    style={{background:'linear-gradient(135deg,#059669 0%,#047857 100%)',color:'#ffffff',border:'none',borderRadius:8,padding:'4px 9px',fontSize:11,fontWeight:800,cursor:'pointer'}}
                  >
                    🧠 Auto-Ordenar Tarjetas de Flow (1 → {parsedAlacarteVisualUrls.length})
                  </button>
                )}
              </div>
              <div style={{fontSize:11.5,color:'#475569',marginBottom:8,lineHeight:1.35}}>
                ¿Tenés muchas tarjetas de pequeños videos en <strong>Google Flow (Veo 3)</strong>? Seleccioná todos los `.mp4` juntos con <strong>📂 Subir</strong>: ATLAS los une en orden secuencial (y podés tocar <strong>🧠 Auto-Ordenar</strong> o las flechas <strong>⬆️ / ⬇️</strong> para acomodarlos).
              </div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:6}}>
                <input
                  type="url"
                  value={newAlacarteVisualUrl}
                  onChange={e=>setNewAlacarteVisualUrl(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addAlacarteVisualUrlToList();}}}
                  placeholder="https://www.youtube.com/watch?v=... (URL de imagen/video)"
                  style={{...inputStyle,padding:'9px 11px',fontSize:12,flex:'1 1 140px'}}
                />
                <button
                  type="button"
                  onClick={addAlacarteVisualUrlToList}
                  style={{background:'#059669',color:'#ffffff',border:'none',borderRadius:9,padding:'8px 10px',fontWeight:750,fontSize:11.5,cursor:'pointer',whiteSpace:'nowrap'}}
                >
                  ＋ Agregar
                </button>
                <label style={{display:'inline-flex',alignItems:'center',gap:4,background:'#047857',color:'#ffffff',padding:'8px 10px',borderRadius:9,fontWeight:750,fontSize:11.5,cursor:uploadingMedia?'wait':'pointer',whiteSpace:'nowrap'}}>
                  <span>📂 Subir Tarjetas Flow</span>
                  <input
                    type="file"
                    accept="video/*,image/*,.mp4,.mov,.webm,.jpg,.jpeg,.png"
                    multiple
                    disabled={uploadingMedia}
                    onChange={e=>{handleUploadFilesFromDevice(e.target.files,'alacarte_visual');e.target.value='';}}
                    style={{display:'none'}}
                  />
                </label>
                <button
                  type="button"
                  onClick={()=>{
                    const flowCmd=`(async()=>{const vids=[...document.querySelectorAll('video')].map(v=>v.currentSrc||v.src||(v.querySelector('source')&&v.querySelector('source').src)||'').filter(Boolean);const uniq=[...new Set(vids)];if(!uniq.length){alert('Abrí o pasá el mouse por las tarjetas de video en Flow para que carguen y volvé a ejecutar.');return;}const httpUrls=uniq.filter(u=>u.startsWith('http')&&!u.startsWith('blob:'));if(httpUrls.length){try{await navigator.clipboard.writeText(httpUrls.join('\\n'));}catch(e){}}for(let i=0;i<uniq.length;i++){try{const r=await fetch(uniq[i]);const b=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='Flow_Tarjeta_'+String(i+1).padStart(2,'0')+'.mp4';document.body.appendChild(a);a.click();a.remove();await new Promise(ok=>setTimeout(ok,350));}catch(e){}}alert('✅ ¡Listo! Se extrajeron '+uniq.length+' tarjetas de Flow numeradas (Flow_Tarjeta_01.mp4 ...). Ahora en ATLAS tocá 📂 Subir Tarjetas Flow y seleccionalas todas juntas.');})();`;
                    navigator.clipboard?.writeText(flowCmd);
                    setCopiedFlowExtractor(true);
                    setTimeout(()=>setCopiedFlowExtractor(false),5000);
                  }}
                  style={{background:copiedFlowExtractor?'#0369a1':'#0f172a',color:'#ffffff',border:'1px solid #10b981',borderRadius:9,padding:'8px 10px',fontWeight:750,fontSize:11.5,cursor:'pointer',whiteSpace:'nowrap'}}
                >
                  {copiedFlowExtractor?'✅ Extractor Copiado (Pegalo en F12 de Flow)':'⚡ Bajar Todas de Colección Flow (1 Clic)'}
                </button>
              </div>
              {parsedAlacarteVisualUrls.length>0&&<div style={{display:'flex',flexDirection:'column',gap:5}}>
                {parsedAlacarteVisualUrls.map((u,idx)=>(
                  <div key={u} style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:6,background:'#ecfdf5',border:'1px solid #6ee7b7',color:'#065f46',padding:'5px 8px',borderRadius:8,fontSize:11,fontWeight:700}}>
                    <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>🎬 Escena #{idx+1} ({idx*5}s–{(idx+1)*5}s): {uploadedFileLabels[u]||u}</span>
                    <div style={{display:'flex',gap:4,flexShrink:0}}>
                      <button type="button" disabled={idx===0} onClick={()=>moveAlacarteVisualUrl(idx,-1)} title="Subir un lugar" style={{background:idx===0?'#e2e8f0':'#d1fae5',color:'#065f46',border:'none',borderRadius:6,padding:'2px 6px',cursor:idx===0?'not-allowed':'pointer',fontWeight:800}}>⬆️</button>
                      <button type="button" disabled={idx===parsedAlacarteVisualUrls.length-1} onClick={()=>moveAlacarteVisualUrl(idx,1)} title="Bajar un lugar" style={{background:idx===parsedAlacarteVisualUrls.length-1?'#e2e8f0':'#d1fae5',color:'#065f46',border:'none',borderRadius:6,padding:'2px 6px',cursor:idx===parsedAlacarteVisualUrls.length-1?'not-allowed':'pointer',fontWeight:800}}>⬇️</button>
                      <button type="button" onClick={()=>removeAlacarteVisualUrlFromList(u)} style={{background:'#fee2e2',color:'#991b1b',border:'none',borderRadius:6,padding:'2px 7px',cursor:'pointer',fontWeight:800}}>✕</button>
                    </div>
                  </div>
                ))}
              </div>}
            </div>

            {/* Opción 4: Voz Propia / Externa (NotebookLM Plus / Gemini Ultra / Grabación) */}
            <div style={{background:'#ffffff',border:alacarteVoiceUrl.trim()?'2px solid #7c3aed':'1px solid #fcd34d',borderRadius:13,padding:12}}>
              <div style={{fontWeight:800,fontSize:12.5,color:'#6d28d9',marginBottom:4}}>
                🎙️ 4. VOZ PROPIA / ULTRA (Subir audio o extraer solo la voz)
              </div>
              <div style={{fontSize:11.5,color:'#475569',marginBottom:8,lineHeight:1.35}}>
                Subí el audio de <strong>NotebookLM Plus</strong>, <strong>Gemini Live Ultra</strong>, tu propia voz grabada (`.mp3`/`.wav`/`.m4a`) o una URL de donde extraer la locución principal.
              </div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:6}}>
                <input
                  type="url"
                  value={alacarteVoiceUrl}
                  onChange={e=>{
                    setAlacarteVoiceUrl(e.target.value);
                    if(e.target.value.trim())setAlacarteNoVoice(false);
                  }}
                  placeholder="https://... (URL de voz o subir archivo ->)"
                  style={{...inputStyle,padding:'9px 11px',fontSize:12,flex:'1 1 145px'}}
                />
                <label style={{display:'inline-flex',alignItems:'center',gap:4,background:'#7c3aed',color:'#ffffff',padding:'8px 11px',borderRadius:9,fontWeight:750,fontSize:11.5,cursor:uploadingMedia?'wait':'pointer',whiteSpace:'nowrap'}}>
                  <span>📂 Subir Voz</span>
                  <input
                    type="file"
                    accept="audio/*,video/*,.mp3,.wav,.m4a,.ogg,.mp4,.webm"
                    disabled={uploadingMedia}
                    onChange={e=>{handleUploadFilesFromDevice(e.target.files,'alacarte_voice');e.target.value='';}}
                    style={{display:'none'}}
                  />
                </label>
              </div>
              {alacarteVoiceUrl.trim()&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:6,background:'#f5f3ff',border:'1px solid #c4b5fd',color:'#5b21b6',padding:'6px 9px',borderRadius:8,fontSize:11,fontWeight:700}}>
                <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>🎙️ Locución principal: {uploadedFileLabels[alacarteVoiceUrl.trim()]||alacarteVoiceUrl.trim()}</span>
                <button type="button" onClick={()=>setAlacarteVoiceUrl('')} style={{background:'#fee2e2',color:'#991b1b',border:'none',borderRadius:6,padding:'2px 7px',cursor:'pointer',fontWeight:800}}>✕</button>
              </div>}
            </div>

            {/* Opción 5: Mensaje / Frases en Pantalla (Google Fonts Kinetic Typography) */}
            <div style={{background:'#ffffff',border:screenMessage.trim()?'2px solid #0284c7':'1px solid #fcd34d',borderRadius:13,padding:12,gridColumn:'1 / -1'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,marginBottom:4}}>
                <div style={{fontWeight:800,fontSize:12.5,color:'#0369a1'}}>
                  💬 5. MENSAJE O FRASES EN PANTALLA (Letras Grandes Legibles `Google Fonts` con Movimiento Suave)
                </div>
                {screenMessage.trim() && (
                  <span style={{background:'#e0f2fe',color:'#0369a1',border:'1px solid #38bdf8',borderRadius:8,padding:'3px 9px',fontSize:11,fontWeight:800}}>
                    ✅ Activo ({zocaloMode === 'clean_none' ? '✨ Solo Letras Flotantes Sin Caja' : `Modo: ${zocaloMode}`})
                  </span>
                )}
              </div>
              <div style={{fontSize:11.5,color:'#475569',marginBottom:8,lineHeight:1.35}}>
                Escribí acá la frase o mensaje que querés que aparezca en el video (con <strong>letras grandes, completas y sin cortar</strong>). Podés escribir <strong>una sola frase</strong> o <strong>varias (una por renglón)</strong> para que roten en cada escena. Si lo dejás vacío y el selector está en <em>Sin Zócalos</em>, el video sale 100% limpio sin letras.
              </div>
              <textarea
                rows={2}
                value={screenMessage}
                onChange={e=>{
                  const val = e.target.value;
                  setScreenMessage(val);
                  if (val.trim() && zocaloMode === 'clean_none') {
                    setZocaloMode('floating_text');
                  }
                }}
                placeholder={"Escribí acá tu frase o mensaje para el video (ejemplo: La paz comienza donde el viento abraza las montañas)…"}
                style={{...inputStyle,padding:'9px 11px',fontSize:12.5,borderColor:screenMessage.trim()?'#0284c7':'#cbd5e1'}}
              />
              {renderLiveScreenMessagePreview()}
            </div>
          </div>

          {/* Barra Google AI Ultra ($149k): Veo 3 / Flow + NotebookLM Plus + Bóveda 30 TB Drive */}
          <div style={{marginTop:12,background:'linear-gradient(135deg,#1e1b4b 0%,#312e81 100%)',color:'#ffffff',borderRadius:13,padding:13,border:'1px solid #6366f1'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,marginBottom:8}}>
              <div>
                <div style={{fontWeight:850,fontSize:13,color:'#e0e7ff'}}>
                  💎 Motor Plan Google AI Ultra ($149k): Veo 3 / Flow + NotebookLM Plus + Bóveda 30 TB Drive
                </div>
                <div style={{fontSize:11.5,color:'#c7d2fe',marginTop:2}}>
                  Generá con 1 clic los 6 prompts cinematográficos para crear tus clips en <strong>Google Flow (Veo 3)</strong> y subilos en la <strong>Casilla #3</strong>; creá locuciones humanas en <strong>NotebookLM Plus</strong> para la <strong>Casilla #4</strong>; y activá tu <strong>Bóveda de 30 TB en Google Drive</strong> dentro de Colab.
                </div>
              </div>
              <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
                <button
                  type="button"
                  disabled={generatingVeo}
                  onClick={handleGenerateVeoFlowPrompts}
                  style={{background:'linear-gradient(135deg,#f59e0b 0%,#d97706 100%)',color:'#ffffff',border:'none',borderRadius:9,padding:'8px 12px',fontWeight:800,fontSize:11.5,cursor:generatingVeo?'wait':'pointer',whiteSpace:'nowrap'}}
                >
                  {generatingVeo?'⏳ Generando…':'🎬 1. Generar 6 Prompts para Veo 3 / Flow'}
                </button>
                <a
                  href="https://labs.google/fx/tools/flow"
                  target="_blank"
                  rel="noreferrer"
                  style={{background:'#4f46e5',color:'#ffffff',textDecoration:'none',borderRadius:9,padding:'8px 11px',fontWeight:750,fontSize:11.5,whiteSpace:'nowrap'}}
                >
                  ↗ Abrir Google Flow (Veo 3)
                </a>
                <a
                  href="https://notebooklm.google.com/"
                  target="_blank"
                  rel="noreferrer"
                  style={{background:'#7c3aed',color:'#ffffff',textDecoration:'none',borderRadius:9,padding:'8px 11px',fontWeight:750,fontSize:11.5,whiteSpace:'nowrap'}}
                >
                  ↗ Abrir NotebookLM Plus
                </a>
                <button
                  type="button"
                  onClick={()=>{
                    const cmd=`from google.colab import drive; drive.mount('/content/drive'); import os; os.makedirs('/content/drive/MyDrive/ATLAS_ULTRA_STUDIO_VAULT/models', exist_ok=True); os.makedirs('/content/drive/MyDrive/ATLAS_ULTRA_STUDIO_VAULT/renders', exist_ok=True); print('✅ Bóveda 30 TB ATLAS_ULTRA_STUDIO_VAULT montada y activa en Google Colab')`;
                    navigator.clipboard?.writeText(cmd);
                    setCopiedVaultCmd(true);
                    setTimeout(()=>setCopiedVaultCmd(false),4000);
                  }}
                  style={{background:copiedVaultCmd?'#059669':'#0f172a',color:'#ffffff',border:'1px solid #818cf8',borderRadius:9,padding:'8px 11px',fontWeight:750,fontSize:11.5,cursor:'pointer',whiteSpace:'nowrap'}}
                >
                  {copiedVaultCmd?'✅ Comando 30 TB Copiado':'💾 3. Copiar Comando Bóveda 30 TB Drive (Colab)'}
                </button>
              </div>
            </div>
            {veoStatus&&<div style={{fontSize:11.5,fontWeight:700,color:'#fde68a',marginBottom:veoPrompts.length?8:0}}>
              {veoStatus}
            </div>}
            {veoPrompts.length>0&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:8,marginTop:6}}>
              {veoPrompts.map((p:any)=>(
                <div key={p.scene} style={{background:'rgba(15,23,42,0.78)',border:'1px solid #4f46e5',borderRadius:9,padding:9,fontSize:11}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                    <strong style={{color:'#fbbf24'}}>🎬 Escena #{p.scene} ({p.timeRange})</strong>
                    <button
                      type="button"
                      onClick={()=>{
                        navigator.clipboard?.writeText(p.veoFlowPromptEs);
                        setCopiedVeoIdx(p.scene);
                        setTimeout(()=>setCopiedVeoIdx(null),2500);
                      }}
                      style={{background:copiedVeoIdx===p.scene?'#059669':'#4338ca',color:'#ffffff',border:'none',borderRadius:6,padding:'3px 8px',fontSize:10.5,fontWeight:750,cursor:'pointer'}}
                    >
                      {copiedVeoIdx===p.scene?'✅ Copiado':'📋 Copiar Prompt Veo 3'}
                    </button>
                  </div>
                  <div style={{color:'#e2e8f0',lineHeight:1.35,marginBottom:4}}>{p.veoFlowPromptEs}</div>
                  <div style={{color:'#94a3b8',fontSize:10}}>Locución guía: “{p.narrationExcerpt}”</div>
                </div>
              ))}
            </div>}
          </div>
        </div>
        <div style={{border:'1px solid #f5d0fe',background:'linear-gradient(180deg,#fdf4ff 0%,#faf5ff 100%)',borderRadius:16,padding:16}}>
          <div style={{...labelStyle,color:'#86198f',marginBottom:6}}>
            5. Conductor / Avatar Humano en Movimiento y Voz IA (Para presentar, enseñar o dar mensajes)
          </div>
          <div style={{fontSize:12,color:'#581c87',marginBottom:10,lineHeight:1.45}}>
            Elegí una <strong>Persona Real en Movimiento (Video en Vivo)</strong> con ondas de voz reactivas y qué <strong>Voz Neuronal ($0.00)</strong> querés usar. Abajo podés escribirle <strong>vos mismo qué tiene que decir en cada momento</strong> (o dejar las casillas vacías para que ATLAS redacte el guion solo según el tema).
          </div>
          <div role="radiogroup" aria-label="Selector de Avatar Conductor" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8,marginBottom:12}}>
            {[
              {id:'none',icon:'🚫',label:'Sin Avatar',sub:'Solo el video'},
              {id:'profesora',icon:'👩‍🏫',label:'Profesora Real (Video)',sub:'Conductora en movimiento',defaultVoice:'female'},
              {id:'periodista',icon:'🎙️',label:'Conductor TV (Video)',sub:'Presentador en movimiento',defaultVoice:'male'},
              {id:'relator',icon:'⚽',label:'Relator Deportivo',sub:'Conductor en vivo',defaultVoice:'male'},
              {id:'documentalista',icon:'🏛️',label:'Documentalista',sub:'Narradora en vivo',defaultVoice:'female'},
              {id:'custom',icon:'🖼️',label:'Tu Propio Video/Foto',sub:'URL YouTube, .mp4 o foto'}
            ].map(item=>{
              const active=avatarRole===item.id;
              return <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={()=>{
                  setAvatarRole(item.id as any);
                  if(item.defaultVoice){
                    setVoiceGender(item.defaultVoice as 'male'|'female');
                  }
                }}
                style={{textAlign:'left',padding:'9px 11px',borderRadius:12,cursor:'pointer',border:active?'2px solid #a21caf':'1px solid #e9d5ff',background:active?'#f3e8ff':'#ffffff',color:'#1e1b4b'}}
              >
                <div style={{fontWeight:750,fontSize:12.5,color:active?'#701a75':'#1e293b'}}>{item.icon} {item.label}</div>
                <div style={{fontSize:11,color:'#6b7280',marginTop:2}}>{item.sub}</div>
              </button>;
            })}
          </div>
          <div style={{background:'#ffffff',border:'1px solid #e9d5ff',borderRadius:12,padding:12,marginBottom:avatarRole!=='none'?12:0}}>
            <div style={{fontSize:12,fontWeight:750,color:'#701a75',marginBottom:8}}>
              🎧 Catálogo de Voces Profesionales ($0.00 Gratis): Google Gemini 2.5 Studio + Microsoft Neural HD + Pipilin + ElevenLabs — Hacé clic en ▶️ para escucharlas:
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(245px,1fr))',gap:8}}>
              {elevenLabsSpanishVoices.map(v=>{
                const isSel=selectedElevenVoiceId===v.id;
                return <div key={v.id} onClick={()=>{setSelectedElevenVoiceId(v.id);setVoiceGender(v.gender);}} style={{padding:'9px 11px',borderRadius:11,cursor:'pointer',border:isSel?'2px solid #9333ea':'1px solid #e2e8f0',background:isSel?'#faf5ff':'#f8fafc'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:6,marginBottom:4}}>
                    <div style={{fontWeight:750,fontSize:12.5,color:isSel?'#6b21a8':'#0f172a'}}>
                      {isSel?'● ':'○ '}{v.name} <span style={{fontSize:11,fontWeight:600,color:'#64748b'}}>({v.role})</span>
                    </div>
                  </div>
                  <div style={{fontSize:11,color:'#475569',marginBottom:v.previewUrl?6:0,lineHeight:1.35}}>{v.desc}</div>
                  {v.previewUrl&&<audio
                    controls
                    preload="none"
                    src={v.previewUrl}
                    onPlay={()=>setPlayingPreviewVoiceId(v.id)}
                    onEnded={()=>setPlayingPreviewVoiceId(prev=>prev===v.id?null:prev)}
                    style={{width:'100%',height:30}}
                  />}
                </div>;
              })}
            </div>
            {selectedElevenVoiceId!=='piper_davefx'&&<div style={{marginTop:10,padding:'8px 12px',borderRadius:10,background:'#f0fdf4',border:'1px solid #86efac',color:'#166534',fontSize:12,fontWeight:700}}>
              ✅ Triple Motor de Estudio Activo ($0.00 Gratis e Ilimitado) — Google Gemini 2.5 Studio TTS (24 kHz PCM) + Microsoft Neural HD + ElevenLabs con dicción en Español y pausas calibradas sin solapamiento.
            </div>}
          </div>
          {avatarRole==='custom'&&<div style={{marginBottom:10}}>
            <label htmlFor="factory-custom-avatar" style={{...labelStyle,fontSize:12,color:'#701a75',marginBottom:4}}>Subí tu propio Video hablando a cámara o tu Foto desde tu PC / Celular (o pegá una URL)</label>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
              <label
                style={{
                  display:'inline-flex',
                  alignItems:'center',
                  gap:6,
                  background:uploadingMedia?'#94a3b8':'#9333ea',
                  color:'#ffffff',
                  padding:'9px 14px',
                  borderRadius:10,
                  fontWeight:750,
                  fontSize:12,
                  cursor:uploadingMedia?'wait':'pointer',
                  whiteSpace:'nowrap'
                }}
              >
                <span>{uploadingMedia?'⏳ Subiendo…':'📂 Subir mi Video / Foto desde PC o Celular'}</span>
                <input
                  type="file"
                  accept="video/*,image/*,.mp4,.mov,.webm,.jpg,.jpeg,.png"
                  disabled={uploadingMedia}
                  onChange={e=>{handleUploadFilesFromDevice(e.target.files,'avatar');e.target.value='';}}
                  style={{display:'none'}}
                />
              </label>
              <input
                id="factory-custom-avatar"
                type="url"
                value={customAvatarUrl}
                onChange={e=>setCustomAvatarUrl(e.target.value)}
                placeholder="O pegá URL https://www.youtube.com/watch?v=... o .mp4/.jpg"
                style={{...inputStyle,flex:'1 1 220px',padding:'9px 12px',fontSize:12.5}}
              />
            </div>
          </div>}
          {avatarRole!=='none'&&<div style={{display:'flex',flexDirection:'column',gap:8,background:'#ffffff',border:'1px solid #e9d5ff',borderRadius:12,padding:12}}>
            <div style={{fontSize:12,fontWeight:750,color:'#701a75'}}>
              ✍️ ¿Qué querés que hable el Avatar? (Escribilo vos acá o dejalo vacío para que ATLAS lo arme solo):
            </div>
            <div>
              <label htmlFor="factory-avatar-intro" style={{...labelStyle,fontSize:11.5,color:'#581c87',marginBottom:3}}>
                🗣️ 1. Al Abrir / Presentar el video (opcional):
              </label>
              <input
                id="factory-avatar-intro"
                type="text"
                maxLength={160}
                value={avatarIntroMessage}
                onChange={e=>setAvatarIntroMessage(e.target.value)}
                placeholder="Ej. Hola a todos, hoy vamos a descubrir la verdad detrás de este hallazgo... (Vacío = automático)"
                style={{...inputStyle,padding:'8px 11px',fontSize:12}}
              />
            </div>
            <div>
              <label htmlFor="factory-avatar-mid" style={{...labelStyle,fontSize:11.5,color:'#581c87',marginBottom:3}}>
                🔗 2. En el Puente del Medio, al unir el Video 1 con el Video 2 (opcional):
              </label>
              <input
                id="factory-avatar-mid"
                type="text"
                maxLength={160}
                value={avatarMidMessage}
                onChange={e=>setAvatarMidMessage(e.target.value)}
                placeholder="Ej. Presten atención ahora a cómo esta segunda parte confirma lo anterior... (Vacío = automático)"
                style={{...inputStyle,padding:'8px 11px',fontSize:12}}
              />
            </div>
            <div>
              <label htmlFor="factory-avatar-msg" style={{...labelStyle,fontSize:11.5,color:'#581c87',marginBottom:3}}>
                🎓 3. Al Cerrar / Enseñanza o Mensaje Final (opcional):
              </label>
              <input
                id="factory-avatar-msg"
                type="text"
                maxLength={160}
                value={avatarMessage}
                onChange={e=>setAvatarMessage(e.target.value)}
                placeholder="Ej. Recordá siempre investigar las fuentes originales y compartir este aprendizaje... (Vacío = automático)"
                style={{...inputStyle,padding:'8px 11px',fontSize:12}}
              />
            </div>
          </div>}
        </div>
        <div style={{border:'1px solid #fde68a',background:'linear-gradient(180deg,#fffbeb 0%,#fef3c7 100%)',borderRadius:16,padding:16}}>
          <div style={{...labelStyle,color:'#92400e',marginBottom:6}}>
            6. Efectos Visuales, Lente y Transiciones (`FX` — Unificación de Color y Cámara Viva)
          </div>
          <div style={{fontSize:12,color:'#78350f',marginBottom:10,lineHeight:1.45}}>
            Elegí el paquete de efectos visuales para igualar la luz/color entre distintos videos, darle movimiento orgánico de cámara (`Push-In`) y aplicar transiciones ópticas entre cortes:
          </div>
          <div role="radiogroup" aria-label="Selector de Efectos Visuales FX" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(175px,1fr))',gap:8}}>
            {[
              {id:'auto',icon:'✨',label:'Automático según Género',sub:'ATLAS elige el FX ideal'},
              {id:'cinema',icon:'🏛️',label:'Cine Documental',sub:'Cálido + viñeta óptica + terciopelo'},
              {id:'flash_tv',icon:'⚡',label:'Impacto TV / Flash',sub:'Destello óptico + nitidez HD'},
              {id:'dynamic',icon:'🔥',label:'Viral / Alto Impacto',sub:'Color vibrante + cámara activa'},
              {id:'vintage',icon:'📜',label:'Archivo / Misterio',sub:'Textura celuloide + tono clásico'},
              {id:'none',icon:'🚫',label:'Sin Efectos (Limpio)',sub:'Color 100% original crudo'}
            ].map(fx=>{
              const active=fxMode===fx.id;
              return <button
                key={fx.id}
                type="button"
                aria-pressed={active}
                onClick={()=>setFxMode(fx.id as any)}
                style={{textAlign:'left',padding:'9px 11px',borderRadius:12,cursor:'pointer',border:active?'2px solid #d97706':'1px solid #fcd34d',background:active?'#fef3c7':'#ffffff',color:'#451a03'}}
              >
                <div style={{fontWeight:750,fontSize:12.5,color:active?'#92400e':'#1e293b'}}>{fx.icon} {fx.label}</div>
                <div style={{fontSize:11,color:'#78350f',marginTop:2}}>{fx.sub}</div>
              </button>;
            })}
          </div>

          <div style={{marginTop:14,paddingTop:14,borderTop:'1px solid #fcd34d'}}>
            <div style={{...labelStyle,color:'#0f172a',marginBottom:4}}>
              🎨 6-B. Diseño Inteligente de Zócalos y Gráficas (`Google Material You 3` + `Google Fonts` + Cristal Esmerilado RGBA)
            </div>
            <div style={{fontSize:12,color:'#475569',marginBottom:10,lineHeight:1.45}}>
              En lugar de cajas cuadradas planas, Google Colab analiza cada corte con <strong>Google Material You (Monet Engine)</strong> para extraer el color vivo dominante de la escena (esmeralda en colinas irlandesas, ámbar en historia, cian en océanos) y dibuja cápsulas redondeadas con sombra difusa y tipografías oficiales de <strong>Google Fonts (`Cinzel` / `Montserrat`)</strong>:
            </div>
            <div role="radiogroup" aria-label="Selector de Diseño Inteligente de Zócalos" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(195px,1fr))',gap:8}}>
              {[
                {id:'clean_none',icon:'🚫',label:'Sin Letras ni Zócalos (Por Defecto)',sub:'100% Limpio: sin cajas ni textos en pantalla'},
                {id:'floating_text',icon:'✨',label:'Solo Letras Flotantes (Google Fonts)',sub:'Mensaje grande flotando limpio sobre el video, SIN cajas'},
                {id:'google_material_you',icon:'🎨',label:'Google Material You 3 (Con Caja)',sub:'Cápsula redondeada + paleta viva de cada escena'},
                {id:'cinema_editorial',icon:'🏛️',label:'Cine / Épico / Celta (Cinzel)',sub:'Letras grandes Cinzel + filetes dorados estilo Netflix'},
                {id:'music_pill',icon:'🎵',label:'Cápsula Musical Flotante',sub:'Pill flotante con ondas de sonido y frase destacada'},
                {id:'tv_impact',icon:'📺',label:'Broadcast TV / Deportes HD',sub:'Zócalo grande de alto contraste periodístico'}
              ].map(z=>{
                const active=zocaloMode===z.id;
                return <button
                  key={z.id}
                  type="button"
                  aria-pressed={active}
                  onClick={()=>setZocaloMode(z.id as any)}
                  style={{textAlign:'left',padding:'9px 11px',borderRadius:12,cursor:'pointer',border:active?'2px solid #0284c7':'1px solid #cbd5e1',background:active?'#e0f2fe':'#ffffff',color:'#0f172a'}}
                >
                  <div style={{fontWeight:750,fontSize:12.5,color:active?'#0369a1':'#1e293b'}}>{z.icon} {z.label}</div>
                  <div style={{fontSize:11,color:'#475569',marginTop:2}}>{z.sub}</div>
                </button>;
              })}
            </div>

            <div style={{marginTop:12,background:'#f8fafc',border:'1px solid #bae6fd',borderRadius:12,padding:12}}>
              <label style={{...labelStyle,color:'#0369a1',marginBottom:4}}>
                💬 Tu Mensaje o Frases en Pantalla (Tipografía Cinética Google Fonts — Opcional)
              </label>
              <div style={{fontSize:11.5,color:'#334155',marginBottom:8,lineHeight:1.45}}>
                Escribí acá la frase, dedicatoria o mensaje que querés que aparezca con <strong>letras grandes, completas y con movimiento suave</strong> sobre el video. Podés escribir <strong>una sola frase</strong> o <strong>varias (una por renglón)</strong> para que vayan rotando en cada escena. Si escribís un mensaje acá, se activan automáticamente las <strong>✨ Letras Flotantes Limpias (sin caja)</strong> salvo que elijas otro diseño arriba:
              </div>
              <textarea
                rows={3}
                value={screenMessage}
                onChange={e=>{
                  const val = e.target.value;
                  setScreenMessage(val);
                  if (val.trim() && zocaloMode === 'clean_none') {
                    setZocaloMode('floating_text');
                  }
                }}
                placeholder={"Ejemplo (1 por renglón o 1 mensaje único):\nLa paz del alma comienza donde el viento abraza las montañas\nDejá que la música celta renueve tu energía hoy"}
                style={{...inputStyle,fontSize:13,background:'#ffffff',borderColor:'#7dd3fc'}}
              />
              {renderLiveScreenMessagePreview()}
            </div>
          </div>
        </div>
        <div style={{border:'1px solid #c7d2fe',background:'linear-gradient(180deg,#eef2ff 0%,#f5f3ff 100%)',borderRadius:14,padding:'11px 14px',fontSize:12,color:'#312e81',lineHeight:1.45}}>
          <div style={{fontWeight:800,fontSize:12.5,color:'#3730a3',marginBottom:3}}>
            🧠 Director Semántico IA (`Gemini 3.5 Flash` + `Argon`) + Cerebro Autónomo ATLAS con Aprendizaje Continuo ($0.00 · 1 llamada/video)
          </div>
          <div>
            <strong>1º Curaduría y Aprendizaje en Vivo (con créditos gratuitos):</strong> En <strong>1 sola llamada a `gemini-3.5-flash`</strong> (con respaldo a `gemini-3-flash-preview` / `gemma-4-26b-a4b-it` + reglas `Argon`), la IA alinea los 6 bloques de voz, elige semánticamente los mejores canales (*Infobae, Clarín, Página 12, La Nación* o sketches de Humor) y <strong>destila cada decisión en la Memoria Semántica de ATLAS (`atlas_ai_distilled_semantic_memory_v1.json`)</strong>.<br/>
            <strong>2º Modo Autónomo Sin Créditos (0 llamadas):</strong> Si se agota la cuota diaria de IA, <strong>el Cerebro Autónomo de ATLAS toma el mando automáticamente</strong> aplicando todos los canales confiables, palabras clave y reglas aprendidas de la IA sin detener la producción.<br/>
            <strong>3º Al Final del Render (`Post-Render Technical QA`):</strong> Certifica 0 congelamientos (`freezedetect`), 0 pantallas negras (`blackdetect`), niveles de sonido y duración exacta del `.mp4`.
          </div>
        </div>
        {(()=>{
          const currentList = allParallelMissions();
          return <div style={{border:'1px solid #a7f3d0',background:'#f0fdf4',borderRadius:14,padding:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:currentList.length>1?10:0}}>
              <div style={{fontSize:12.5,fontWeight:750,color:'#065f46'}}>
                📋 Lote listo para enviar: {currentList.length} {currentList.length===1?'Misión configurada':'Misiones distintas para producir EN PARALELO a la vez'}
              </div>
              {currentList.length < 5 && (
                <button
                  type="button"
                  onClick={()=>addAnotherParallelMission()}
                  style={{background:'#ffffff',color:'#047857',border:'1px solid #059669',borderRadius:9,padding:'6px 12px',fontSize:12,fontWeight:750,cursor:'pointer'}}
                >
                  ＋ Agregar Misión #{currentList.length + 1} en Paralelo (Ej. {['Informe deportivo','Documental','Informe periodístico','Educativo','Biografía'][currentList.length % 5]})
                </button>
              )}
            </div>
            {currentList.length > 1 && (
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {currentList.map((m, idx) => {
                  const gName = m.genre === 'Otro' ? (m.customGenre || 'Otro') : m.genre;
                  const vObj = elevenLabsSpanishVoices.find(v => v.id === m.selectedElevenVoiceId);
                  const vShort = vObj ? vObj.name.split(' (')[0] : 'Pipilin';
                  const isAct = idx === activeDraftIdx;
                  return (
                    <div
                      key={idx}
                      onClick={()=>switchParallelTab(idx)}
                      style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,background:isAct?'#dcfce7':'#ffffff',border:isAct?'1px solid #059669':'1px solid #bbf7d0',borderRadius:9,padding:'7px 10px',fontSize:12,cursor:'pointer'}}
                    >
                      <div style={{color:'#064e3b'}}>
                        <strong>Misión #{idx + 1} ({genreIcons[m.genre] || '🎬'} {gName}):</strong>{' '}
                        {m.subject.trim() || m.script.trim().slice(0, 60) || <em style={{color:'#b45309'}}>Falta indicar tema/guion (clic para editar)</em>}{' '}
                        <span style={{color:'#047857',fontWeight:600}}>· Voz: {vShort} · {m.seconds || '60'}s · {m.format}</span>
                      </div>
                      <button
                        type="button"
                        onClick={e=>{e.stopPropagation();removeParallelMissionAt(idx);}}
                        style={{background:'#fee2e2',color:'#b91c1c',border:'1px solid #fecaca',borderRadius:6,padding:'2px 7px',fontSize:11,fontWeight:700,cursor:'pointer'}}
                      >
                        Quitar
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>;
        })()}
        <button type="submit" className="factory-primary" disabled={submitting}>
          {submitting
            ? 'Enviando a ATLAS…'
            : parallelDrafts.length > 1
              ? `🚀 Enviar y Producir las ${parallelDrafts.length} Misiones en Paralelo a la Vez`
              : 'Enviar misión a ATLAS'}
        </button>
        <div style={{fontSize:12,color:'#74899b',lineHeight:1.6}}>El envío requiere tu sesión autenticada de YOUAPP. ATLAS debe verificar fuentes, derechos, voz, infraestructura y permisos antes de producir. Nunca se inicia un render ni se activan APIs pagas si estos controles están bloqueados.</div>
        {message&&<p role="status" style={{margin:0,color:'#23546f',fontSize:13}}>{message}</p>}
        {liveRunningMission&&(()=>{
          const {pct,remSec,stepIdx,isStalled,staleMin,steps}=computeLiveMissionProgress(liveRunningMission,tickSec);
          return <div role="region" aria-label="Progreso de producción en vivo" style={{border:isStalled?'1.5px solid #f59e0b':'1px solid #7dd3fc',background:isStalled?'linear-gradient(180deg,#fffbeb 0%,#fef3c7 100%)':'linear-gradient(180deg,#f0f9ff 0%,#e0f2fe 100%)',padding:'16px 18px',borderRadius:16,boxShadow:'0 6px 20px rgba(14,165,233,0.10)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginBottom:8,flexWrap:'wrap'}}>
              <div style={{fontSize:14,fontWeight:750,color:isStalled?'#92400e':'#0c4a6e'}}>
                {isStalled?'⏸️ Colab en espera: ':'🎬 Produciendo: '}{liveRunningMission.title||liveRunningMission.missionId}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{background:isStalled?'#d97706':'#0284c7',color:'#fff',fontWeight:750,fontSize:12,padding:'4px 10px',borderRadius:999}}>{pct}%</span>
                <span style={{background:'#ffffff',border:isStalled?'1px solid #fcd34d':'1px solid #bae6fd',color:isStalled?'#92400e':'#0369a1',fontWeight:650,fontSize:12,padding:'4px 10px',borderRadius:999}}>
                  {isStalled?`⚠️ Pausa (${staleMin}m)`:`⏱️ ${formatRemainingTime(remSec)}`}
                </span>
              </div>
            </div>
            <div style={{width:'100%',height:12,background:'#cbd5e1',borderRadius:999,overflow:'hidden',marginBottom:10,boxShadow:'inset 0 1px 3px rgba(0,0,0,0.12)'}}>
              <div style={{width:`${pct}%`,height:'100%',background:isStalled?'linear-gradient(90deg,#f59e0b 0%,#fbbf24 100%)':'linear-gradient(90deg,#0284c7 0%,#10b981 55%,#38bdf8 100%)',borderRadius:999,transition:'width 0.8s ease'}}/>
            </div>
            <div style={{fontSize:12,color:isStalled?'#92400e':'#075985',marginBottom:10,fontWeight:550}}>
              {liveRunningMission.detail||'Procesando automáticamente en Google Colab ($0.00)…'}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(6,minmax(0,1fr))',gap:6}}>
              {steps.map((label,idx)=>{
                const done=(idx+1)<stepIdx;
                const active=(idx+1)===stepIdx;
                return <div key={label} style={{fontSize:10.5,textAlign:'center',padding:'5px 4px',borderRadius:8,fontWeight:active?750:600,background:done?'#d1fae5':active?(isStalled?'#d97706':'#0284c7'):'#ffffff',color:done?'#065f46':active?'#ffffff':'#64748b',border:done?'1px solid #6ee7b7':active?(isStalled?'1px solid #b45309':'1px solid #0369a1'):'1px solid #cbd5e1'}}>
                  {done?'✓ ':''}{label}
                </div>;
              })}
            </div>
          </div>;
        })()}
        {prepared&&<section style={{border:'1px solid #b9e2f6',background:'#eef9ff',padding:15,borderRadius:12}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}><Check size={18}/><strong>{dispatch?'Orden registrada por el servidor':'Orden preparada, no enviada'}</strong></div>
          <p style={{margin:'0 0 12px',fontSize:13,color:'#55768c'}}>{prepared.quantity} video(s) · {prepared.genre} · {prepared.durationSeconds} segundos · {prepared.format}. {dispatch?'Estado: '+dispatch.status+' · Código: '+dispatch.id:'Pendiente de recepción autenticada por ATLAS.'}</p>
          {dispatch?.blocker&&<p role="status" style={{fontSize:13,color:'#986c25'}}>{dispatch.blocker}</p>}
          {dispatch&&<button type="button" className="factory-secondary" disabled={submitting} onClick={()=>{void refreshDispatch();}}>Consultar estado del pedido</button>}
          <button type="button" className="factory-secondary" onClick={copyOrder}><Copy size={14} style={{verticalAlign:'middle',marginRight:6}}/>Copiar orden estructurada</button>
        </section>}
      </form>
      <aside style={{display:'flex',flexDirection:'column',gap:16}}>
        <section style={cardStyle}><h2 style={{display:'flex',alignItems:'center',gap:8,fontSize:18,margin:'0 0 12px'}}><ShieldCheck size={20}/> Dirección y reglamento</h2>
          <p style={{fontSize:13,color:'#647d91',lineHeight:1.7,margin:0}}>ATLAS deberá aplicar lo que ya aprendió, seleccionar medios reales cuando corresponda, utilizar la voz aprobada, verificar derechos y calidad, producir en nube cuando esté disponible y mostrar el resultado aquí.</p>
          {learningSummary&&<div style={{marginTop:10,padding:'10px 12px',background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:10,fontSize:12,color:'#0c4a6e'}}>
            <strong>Memoria activa Rev. {learningSummary.learningRevision}:</strong> {learningSummary.totalLearnedRules} reglas de calidad · {learningSummary.verifiedVideoSourcesCount} fuentes cloud verificadas · Estándar {learningSummary.renderEngineStandard}
            {learningSummary.colabWorkerCellCmd&&<div style={{marginTop:8}}>
              <button type="button" className="factory-secondary" style={{fontSize:11,padding:'6px 10px'}} onClick={async()=>{try{await navigator.clipboard.writeText(learningSummary.colabWorkerCellCmd);setFeedbackStatus('Comando del Demonio Persistente Colab copiado al portapapeles.');}catch{setFeedbackStatus('No se pudo copiar automáticamente.');}}}>
                <Copy size={12} style={{verticalAlign:'middle',marginRight:5}}/>Copiar Demonio Persistente Colab (1 sola vez por sesión)
              </button>
            </div>}
          </div>}
          {activeAutoMissions.length>0&&<div style={{marginTop:10,padding:'10px 12px',background:'#ecfdf5',border:'1px solid #a7f3d0',borderRadius:10,fontSize:12,color:'#065f46'}}>
            <strong>Cola Automática Cloud-First ($0.00 · Hasta 5 en paralelo):</strong>
            {activeAutoMissions.slice(0,5).map((m:any)=>{
              const isDone=m.status==='COMPLETE'||m.stage==='COMPLETE';
              const isFailed=m.status==='FAILED';
              const dyn=computeLiveMissionProgress(m,m.missionId===liveRunningMission?.missionId?tickSec:0);
              const pct=isDone?100:dyn.pct;
              const rem=isDone?0:dyn.remSec;
              return <div key={m.missionId} style={{marginTop:8,paddingTop:8,borderTop:'1px dashed #6ee7b7'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:6}}>
                  <strong>{m.title||m.subject||m.missionId}</strong>
                  <span style={{fontWeight:700,color:isDone?'#047857':isFailed?'#b91c1c':dyn.isStalled?'#b45309':'#0284c7'}}>
                    {isDone?'✅ 100% Listo':isFailed?'⚠️ Revisar':dyn.isStalled?`${pct}% · ⏸️ En espera`:`${pct}% · ⏱️ ${formatRemainingTime(rem)}`}
                  </span>
                </div>
                <div style={{width:'100%',height:7,background:'#d1fae5',borderRadius:999,overflow:'hidden',margin:'5px 0'}}>
                  <div style={{width:`${pct}%`,height:'100%',background:isDone?'#10b981':isFailed?'#ef4444':dyn.isStalled?'#f59e0b':'linear-gradient(90deg,#0284c7,#10b981)',borderRadius:999,transition:'width 0.8s ease'}}/>
                </div>
                <div style={{fontSize:11,color:dyn.isStalled&&!isDone?'#92400e':'#047857'}}>{m.detail||m.stage||m.status}</div>
              </div>;
            })}
          </div>}
          <p style={{color:'#0f5132',fontSize:12,margin:'13px 0 0'}}><ShieldCheck size={13} style={{verticalAlign:'middle',marginRight:4}}/>Pipeline automático Guion → Voz Piper → Música Real → Wikidata P18 + YouTube CC → 0 Congelaciones activo.</p>
        </section>
        <section style={{...cardStyle,border:'1.5px solid #f59e0b',background:'linear-gradient(180deg,#0f172a 0%,#1e293b 100%)',color:'#f8fafc'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,marginBottom:showFxPreviewV4?10:0}}>
            <div style={{fontSize:15,fontWeight:800,color:'#fde68a'}}>
              🎬 Vista Previa en Vivo: 6 Efectos Profesionales para Edición V4 (60 FPS)
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <a href="/efectos-v4.html" target="_blank" rel="noreferrer" style={{background:'#d97706',color:'#fff',padding:'5px 10px',borderRadius:8,fontSize:12,fontWeight:750,textDecoration:'none'}}>
                ↗ Abrir en pestaña grande
              </a>
              <button type="button" onClick={()=>setShowFxPreviewV4(v=>!v)} style={{background:'#334155',color:'#e2e8f0',border:'1px solid #475569',padding:'5px 10px',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer'}}>
                {showFxPreviewV4?'Ocultar':'Mostrar Demo'}
              </button>
            </div>
          </div>
          {showFxPreviewV4&&<iframe title="Demo en vivo de 6 efectos profesionales V4" src="/efectos-v4.html" style={{width:'100%',height:560,border:'1px solid #334155',borderRadius:10,background:'#0b1120',display:'block'}}/>}
        </section>
        <section style={cardStyle}><h2 style={{fontSize:18,margin:'0 0 12px',display:'flex',alignItems:'center',gap:8}}><Film size={19}/> Reproductor</h2>
          <p style={{color:'#71879a',fontSize:13}}>Los videos terminados aparecerán aquí cuando exista una entrega verificada. Podés consultar una prueba anterior.</p>
          {verifiedDeliveries.length>0&&<div style={{margin:'10px 0',display:'flex',flexDirection:'column',gap:8}}>
            <label htmlFor="factory-cloud-delivery-select" style={{fontSize:12,fontWeight:600,color:'#344c63'}}>Entregas privadas verificadas en Supabase:</label>
            <select id="factory-cloud-delivery-select" value={selectedDeliveryId} onChange={e=>{void renewAndPlayCloudDelivery(e.target.value);}} style={{...inputStyle,padding:'9px 11px',fontSize:13}}>
              {verifiedDeliveries.map((d:any)=><option key={d.id} value={d.id}>{d.title} [{d.qaStatus} · Congelaciones: {d.freezeEventsCount??0}]</option>)}
            </select>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <button type="button" className="factory-secondary" disabled={submitting} onClick={()=>{void renewAndPlayCloudDelivery(selectedDeliveryId);}}>Renovar enlace privado (sin re-render)</button>
              <button type="button" disabled={submitting} onClick={()=>{void remasterCloudDelivery(selectedDeliveryId,'1080p');}} style={{background:'linear-gradient(135deg,#f59e0b 0%,#d97706 100%)',color:'#ffffff',border:'1px solid #b45309',borderRadius:11,padding:'10px 14px',fontWeight:750,fontSize:12.5,cursor:submitting?'wait':'pointer',boxShadow:'0 3px 10px rgba(217,119,6,0.25)'}}>
                ✨ Remasterizar a Full HD 1080p ($0.00)
              </button>
              <button type="button" disabled={submitting} onClick={()=>{void remasterCloudDelivery(selectedDeliveryId,'4k');}} style={{background:'linear-gradient(135deg,#4f46e5 0%,#3730a3 100%)',color:'#ffffff',border:'1px solid #312e81',borderRadius:11,padding:'10px 14px',fontWeight:750,fontSize:12.5,cursor:submitting?'wait':'pointer',boxShadow:'0 3px 10px rgba(79,70,229,0.28)'}}>
                💎 Remasterizar en 4K Ultra HD ($0.00)
              </button>
              <button type="button" onClick={()=>{void toggleSideBySideCompare();}} style={{background:compareSideBySide?'#0f172a':'#f1f5f9',color:compareSideBySide?'#38bdf8':'#1e293b',border:compareSideBySide?'1.5px solid #38bdf8':'1px solid #cbd5e1',borderRadius:11,padding:'10px 13px',fontWeight:750,fontSize:12.5,cursor:'pointer'}}>
                {compareSideBySide?'✖ Cerrar Comparador':'🔀 Comparar Lado a Lado (Original vs. Remaster)'}
              </button>
              <button type="button" onClick={()=>setZoomMagnifier(z=>!z)} style={{background:zoomMagnifier?'#0f172a':'#f1f5f9',color:zoomMagnifier?'#fbbf24':'#1e293b',border:zoomMagnifier?'1.5px solid #fbbf24':'1px solid #cbd5e1',borderRadius:11,padding:'10px 13px',fontWeight:750,fontSize:12.5,cursor:'pointer'}}>
                {zoomMagnifier?'🔍 Zoom 100% (Normal)':'🔍 Lupa 2.2x (Ver Detalle 4K)'}
              </button>
              {activeCreditsUrl&&<a href={activeCreditsUrl} target="_blank" rel="noreferrer" className="factory-secondary" style={{textDecoration:'none',fontSize:12,display:'inline-flex',alignItems:'center'}}>Ver créditos y licencias</a>}
              {activeContactSheetUrl&&<a href={activeContactSheetUrl} target="_blank" rel="noreferrer" className="factory-secondary" style={{textDecoration:'none',fontSize:12,display:'inline-flex',alignItems:'center'}}>Ver hoja de contacto 4×3 (12 cortes)</a>}
              {assembledSingleBlobUrl&&<a href={assembledSingleBlobUrl} download={String(selectedDeliveryObj?.id||'').includes('v6')?'Rerum_Novarum_V6_Cinema_Master_1080p_COMPLETO.mp4':String(selectedDeliveryObj?.id||'').includes('v5')?'Rerum_Novarum_V5_Directors_Cut_1080p_COMPLETO.mp4':String(selectedDeliveryObj?.id||'').includes('v4')?'Rerum_Novarum_V4_Master_1080p_COMPLETO.mp4':'Rerum_Novarum_V3_Premium_1080p_COMPLETO.mp4'} style={{background:'linear-gradient(135deg,#059669 0%,#047857 100%)',color:'#ffffff',border:'1px solid #065f46',borderRadius:11,padding:'10px 14px',fontWeight:800,fontSize:12.5,textDecoration:'none',display:'inline-flex',alignItems:'center',boxShadow:'0 3px 10px rgba(5,150,105,0.28)'}}>⬇ Descargar 1 Solo MP4 Completo 1080p ({selectedDeliveryObj?.totalShardBytes?(selectedDeliveryObj.totalShardBytes/1048576).toFixed(1)+' MB':'Full HD'})</a>}
            </div>
          </div>}
          {assemblingShards&&<div style={{margin:'12px 0',padding:'14px 16px',borderRadius:12,background:'#0f172a',color:'#fbbf24',border:'1.5px solid #f59e0b',fontWeight:750,fontSize:13}}>
            ⚡ Uniendo en memoria RAM los punteros binarios en 1 solo MP4 Full HD 1080p continuo ({selectedDeliveryObj?.totalShardBytes?(selectedDeliveryObj.totalShardBytes/1048576).toFixed(1)+' MB':'Full HD'} · 0 bytes en disco C:)…
          </div>}
          {playbackUrl&&<div aria-label="Resultado de esta misión" style={{margin:'12px 0'}}>
            {(()=>{
              const cur=verifiedDeliveries.find((d:any)=>d.id===selectedDeliveryId);
              const w=liveVideoMeta?.width||Number(String(cur?.size||'').split('x')[0])||0;
              const h=liveVideoMeta?.height||Number(String(cur?.size||'').split('x')[1])||0;
              const is4kLive = Math.max(w,h)>=2160 || /remaster_4k|2160x3840|3840x2160/i.test(`${cur?.id||''} ${cur?.title||''} ${cur?.size||''}`);
              const is1080Live = !is4kLive && (Math.max(w,h)>=1080 || /remaster|1080x1920|1920x1080/i.test(`${cur?.id||''} ${cur?.title||''} ${cur?.size||''}`));
              const totalCombinedBytes = cur?.totalShardBytes || ((cur?.bytes||0) + (cur?.part2Bytes||0) + (cur?.part3Bytes||0));
              const mb = totalCombinedBytes ? (totalCombinedBytes/1048576).toFixed(2) : (cur?.bytes ? (cur.bytes/1048576).toFixed(2) : null);
              const durSecUse = liveVideoMeta?.duration || cur?.totalThreePartsDurationSeconds || cur?.durationSeconds || 0;
              const totalDurLabel = durSecUse > 0 ? `${Math.floor(durSecUse/60)}m ${Math.round(durSecUse%60)}s` : null;
              return <>
                <div style={{marginBottom:10,padding:'10px 13px',borderRadius:11,background:is4kLive?'linear-gradient(135deg,#1e1b4b 0%,#312e81 100%)':is1080Live?'linear-gradient(135deg,#451a03 0%,#78350f 100%)':'#f1f5f9',color:is4kLive||is1080Live?'#ffffff':'#1e293b',border:is4kLive?'1.5px solid #818cf8':is1080Live?'1.5px solid #fbbf24':'1px solid #cbd5e1',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    <span style={{fontWeight:800,fontSize:12.5,background:is4kLive?'#4f46e5':is1080Live?'#d97706':'#cbd5e1',color:is4kLive||is1080Live?'#ffffff':'#0f172a',padding:'3px 9px',borderRadius:6}}>
                      {is4kLive?'💎 4K ULTRA HD (2160p REAL)':is1080Live?'✨ FULL HD 1080p PREMIUM':'📺 HD ESTÁNDAR (720p)'}
                    </span>
                    <span style={{fontSize:12.5,fontWeight:700}}>
                      Resolución Decodificada: <code>{w&&h?`${w}×${h} px`:(cur?.size||'720×1280 px')}</code>
                      {mb?` · Peso Master: ${mb} MB`:''}
                      {totalDurLabel?` · Duración Total: ${totalDurLabel}`:''}
                      {cur?` · Congelaciones: ${cur.freezeEventsCount??0} (${cur.qaStatus||'PASS'})`:''}
                    </span>
                  </div>
                  {(is4kLive||is1080Live)&&<span style={{fontSize:11,color:'#e0e7ff'}}>
                    💡 Tip: Activá <strong>🔍 Lupa 2.2x</strong> o <strong>Pantalla Completa (⛶)</strong> para apreciar los {w&&h?`${w}×${h}`:'2160×3840'} píxeles reales sin compresión del recuadro chico.
                  </span>}
                </div>
                {cur?.signedVideoPart2Url&&<div style={{marginBottom:10,padding:'9px 12px',borderRadius:10,background:'#0f172a',border:'1px solid #334155',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
                  <div style={{fontSize:12,fontWeight:700,color:'#fbbf24'}}>
                    🎬 Master Cinema Continuo High-Bitrate ({cur.signedVideoPart3Url?'3 Actos':'2 Partes'} · Auto-avance continuo activado)
                  </div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    <button type="button" onClick={()=>{setAutoAdvancePart(false);setActivePartIdx(1);}} style={{background:activePartIdx===1?'#f59e0b':'#1e293b',color:activePartIdx===1?'#0f172a':'#e2e8f0',border:'1px solid #475569',borderRadius:8,padding:'5px 11px',fontSize:12,fontWeight:800,cursor:'pointer'}}>
                      {activePartIdx===1?'▶ ':''}Acto I (Cap. I–III)
                    </button>
                    <button type="button" onClick={()=>{setAutoAdvancePart(false);setActivePartIdx(2);}} style={{background:activePartIdx===2?'#f59e0b':'#1e293b',color:activePartIdx===2?'#0f172a':'#e2e8f0',border:'1px solid #475569',borderRadius:8,padding:'5px 11px',fontSize:12,fontWeight:800,cursor:'pointer'}}>
                      {activePartIdx===2?'▶ ':''}Acto II (Cap. IV–VI)
                    </button>
                    {cur.signedVideoPart3Url&&<button type="button" onClick={()=>{setAutoAdvancePart(false);setActivePartIdx(3);}} style={{background:activePartIdx===3?'#f59e0b':'#1e293b',color:activePartIdx===3?'#0f172a':'#e2e8f0',border:'1px solid #475569',borderRadius:8,padding:'5px 11px',fontSize:12,fontWeight:800,cursor:'pointer'}}>
                      {activePartIdx===3?'▶ ':''}Acto III (Cap. VII–IX · Francisco y León XIV)
                    </button>}
                  </div>
                </div>}
              </>;
            })()}
            {compareSideBySide ? (
              <div style={{background:'#0f172a',padding:12,borderRadius:14,border:'1.5px solid #38bdf8',marginBottom:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,marginBottom:10}}>
                  <div style={{color:'#38bdf8',fontWeight:800,fontSize:13}}>
                    🔀 COMPARADOR SINCRONIZADO EN TIEMPO REAL (Original vs. Remasterizado)
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                    <select value={compareOriginalId} onChange={e=>{void changeCompareOriginal(e.target.value);}} style={{background:'#1e293b',color:'#f8fafc',border:'1px solid #475569',borderRadius:8,padding:'5px 9px',fontSize:12}}>
                      {verifiedDeliveries.map((d:any)=><option key={d.id} value={d.id}>Comparar contra: {d.id} ({d.size||'720x1280'} · {d.bytes?(d.bytes/1048576).toFixed(1)+' MB':''})</option>)}
                    </select>
                    <button type="button" onClick={()=>{
                      const v1=document.getElementById('atlas-compare-orig-vid') as HTMLVideoElement|null;
                      const v2=document.getElementById('atlas-compare-rem-vid') as HTMLVideoElement|null;
                      if(v1&&v2){v1.currentTime=0;v2.currentTime=0;void v1.play();void v2.play();}
                    }} style={{background:'#0284c7',color:'#fff',border:'none',borderRadius:8,padding:'6px 12px',fontSize:12,fontWeight:750,cursor:'pointer'}}>
                      ▶️ Reproducir Ambos Sincronizados
                    </button>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div style={{background:'#020617',borderRadius:10,padding:8,border:'1px solid #334155'}}>
                    <div style={{fontSize:11.5,fontWeight:800,color:'#94a3b8',marginBottom:6,display:'flex',justifyContent:'space-between'}}>
                      <span>📼 ANTES (Original: {compareOriginalId||'720p'})</span>
                      <span>{compareOriginalMeta?`${compareOriginalMeta.width}×${compareOriginalMeta.height} px`:'720×1280 px'}</span>
                    </div>
                    <div style={{overflow:'hidden',borderRadius:8}}>
                      {compareOriginalUrl&&<video id="atlas-compare-orig-vid" key={compareOriginalUrl} controls preload="metadata" playsInline src={compareOriginalUrl} onLoadedMetadata={e=>{const v=e.currentTarget;setCompareOriginalMeta({width:v.videoWidth,height:v.videoHeight,duration:v.duration});}} style={{width:'100%',maxHeight:420,background:'#020617',transform:zoomMagnifier?'scale(2.2)':'none',transformOrigin:'center center',transition:'transform 0.25s ease'}}/>}
                    </div>
                  </div>
                  <div style={{background:'#020617',borderRadius:10,padding:8,border:'1.5px solid #818cf8'}}>
                    <div style={{fontSize:11.5,fontWeight:800,color:'#a5b4fc',marginBottom:6,display:'flex',justifyContent:'space-between'}}>
                      <span>💎 DESPUÉS (Activo: {selectedDeliveryId})</span>
                      <span>{liveVideoMeta?`${liveVideoMeta.width}×${liveVideoMeta.height} px`:'2160×3840 px'}</span>
                    </div>
                    <div style={{overflow:'hidden',borderRadius:8}}>
                      <video id="atlas-compare-rem-vid" key={playbackUrl} controls preload="metadata" playsInline src={playbackUrl} onLoadedMetadata={e=>{const v=e.currentTarget;setLiveVideoMeta({width:v.videoWidth,height:v.videoHeight,duration:v.duration});}} style={{width:'100%',maxHeight:420,background:'#020617',transform:zoomMagnifier?'scale(2.2)':'none',transformOrigin:'center center',transition:'transform 0.25s ease'}}/>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{overflow:'hidden',borderRadius:12,border:'1px solid #1e293b',background:'#020617'}}>
                <video
                  key={playbackUrl}
                  controls
                  autoPlay={autoAdvancePart}
                  preload="metadata"
                  playsInline
                  src={playbackUrl}
                  onPlay={()=>{if(autoAdvancePart)setAutoAdvancePart(false);}}
                  onEnded={()=>{
                    const cur=verifiedDeliveries.find((d:any)=>d.id===selectedDeliveryId);
                    if(activePartIdx===1&&cur?.signedVideoPart2Url){setAutoAdvancePart(true);setActivePartIdx(2);}
                    else if(activePartIdx===2&&cur?.signedVideoPart3Url){setAutoAdvancePart(true);setActivePartIdx(3);}
                  }}
                  onLoadedMetadata={e=>{const v=e.currentTarget;setLiveVideoMeta({width:v.videoWidth,height:v.videoHeight,duration:v.duration});}}
                  style={{width:'100%',maxHeight:520,background:'#020617',borderRadius:12,transform:zoomMagnifier?'scale(2.2)':'none',transformOrigin:'center center',transition:'transform 0.25s ease'}}
                />
              </div>
            )}
            {(()=>{const cur=verifiedDeliveries.find((d:any)=>d.id===selectedDeliveryId);return <p style={{fontSize:12,color:'#4b6478'}}>
              {cur?<><strong>{cur.id}</strong> · SHA: <code>{String(cur.sha256||'').slice(0,12)}…</code> · {cur.bytes?(cur.bytes/1048576).toFixed(2)+' MB':'60s'} · </>:null}
              MP4 privado de esta misión · Entregado para revisión, sin publicación automática.
            </p>;})()}
          </div>}
          {verifiedDeliveries.length>0&&<div style={{margin:'12px 0',padding:12,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:12}}>
            <div style={{fontSize:12,fontWeight:650,color:'#1e293b',marginBottom:6}}>Enseñar a ATLAS (Evaluación del Director sobre esta entrega)</div>
            <input value={directorNote} onChange={e=>setDirectorNote(e.target.value)} placeholder="Nota opcional (ej. excelente paneo y música V4, mantener este estándar)" style={{...inputStyle,padding:'8px 10px',fontSize:12,marginBottom:8}} maxLength={500}/>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              <button type="button" className="factory-secondary" disabled={submitting} style={{fontSize:12,padding:'7px 10px'}} onClick={()=>{void submitDirectorFeedback('APPROVED_AS_REFERENCE_EXAMPLE','Aprobado como ejemplo de referencia de calidad y ritmo.');}}>⭐ Aprobar como ejemplo</button>
              <button type="button" className="factory-secondary" disabled={submitting} style={{fontSize:12,padding:'7px 10px'}} onClick={()=>{void submitDirectorFeedback('LIKED_WITH_IMPROVEMENTS','Buen resultado general; ajustar ritmo o encuadre en próxima versión.');}}>🎬 Mejorar imagen/ritmo</button>
              <button type="button" className="factory-secondary" disabled={submitting} style={{fontSize:12,padding:'7px 10px'}} onClick={()=>{void submitDirectorFeedback('NEEDS_VISUAL_OR_AUDIO_ADJUSTMENT','Revisar mezcla de música/voz o selección de fragmentos.');}}>🎵 Mejorar música/mezcla</button>
            </div>
            {feedbackStatus&&<p role="status" style={{fontSize:12,color:'#0f5132',margin:'8px 0 0'}}>{feedbackStatus}</p>}
          </div>}
          <button type="button" className="factory-secondary" onClick={()=>setShowExample(v=>!v)}><Play size={14} style={{verticalAlign:'middle',marginRight:6}}/>{showExample?'Ocultar video anterior':'Ver video anterior: Federico Grote'}</button>
          {showExample&&<div style={{marginTop:12}}><video controls preload="metadata" playsInline src="/videos/padre_federico_grote_120s_archivo_real_v2.mp4" style={{width:'100%',maxHeight:420,background:'#020617',borderRadius:12}}/><p style={{fontSize:12,color:'#748a9d'}}>Versión histórica de revisión previa. No es un render de esta misión.</p></div>}
        </section>
        <section style={cardStyle}><h2 style={{fontSize:17,margin:'0 0 10px'}}>Misiones existentes de ATLAS</h2>
          <button type="button" className="factory-secondary" onClick={()=>setShowMissions(v=>!v)}>{showMissions?'Ocultar seguimiento':'Abrir seguimiento real'}</button>
          <button type="button" className="factory-secondary" disabled={submitting} style={{marginLeft:8}} onClick={()=>{void inspectExistingArgon();}}>Verificar selección Argon de Justicia Social</button>
          <button type="button" className="factory-secondary" disabled={submitting} onClick={()=>{void correctExistingJusticeDuration();}}>Corregir a 60 segundos la misión existente</button>
          <button type="button" className="factory-secondary" disabled={submitting} onClick={()=>{void verifyCorrectedCloudMission();}}>Verificar lectura Atlas de misión 60s</button>
          {existingArgonStatus&&<p role="status" style={{fontSize:12,color:'#23546f'}}>{existingArgonStatus}</p>}
          <p style={{color:'#748a9d',fontSize:12,lineHeight:1.5}}>Este seguimiento solo opera con misiones previamente preparadas y autorizadas para tu cuenta.</p>
        </section>
      </aside>
    </div>
    {showMissions&&<div style={{marginTop:24}}><AtlasCloudMissionLivePanel/></div>}
  </main>;
}
