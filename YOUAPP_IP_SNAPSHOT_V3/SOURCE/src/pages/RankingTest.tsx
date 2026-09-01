import { useState } from 'react';
import { searchAndNormalizeYouTube } from '../lib/youtubeChannelSearch';
import { rankCandidates, buildDiverseTVSignal, MIN_YOU_SCORE } from '../lib/youappRanking';
import type { ScoredCandidate } from '../lib/youappRanking';

export default function RankingTest() {
  const [results, setResults] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentQuery, setCurrentQuery] = useState('');
  const [expandedQuery, setExpandedQuery] = useState<number | null>(null);

  const QUERIES = [
    {q:'entre rios',t:'General'},{q:'noticias entre rios',t:'Noticias'},
    {q:'historia de entre rios',t:'Historia'},{q:'lugares para visitar entre rios',t:'Turismo'},
    {q:'economia de entre rios',t:'Economia'},{q:'politica entre rios',t:'Politica'},
    {q:'river plate',t:'Deporte'},{q:'ultimas noticias river plate',t:'Dep.Actualidad'},
    {q:'historia de river plate',t:'Dep.Historia'},{q:'agujeros negros',t:'Ciencia'},
    {q:'como funcionan los agujeros negros',t:'Educacion'},{q:'documental del universo',t:'Documental'},
    {q:'inteligencia artificial',t:'Tecnologia'},{q:'noticias de inteligencia artificial',t:'Tech News'},
    {q:'superman pelicula',t:'Cine'},{q:'historia de superman',t:'Cine Historia'},
    {q:'gta 6',t:'Videojuegos'},{q:'yayoi kusama arte',t:'Arte'},
    {q:'historia del tango',t:'Cultura'},{q:'inflacion argentina',t:'Economia 2'},
  ];

  const run = async () => {
    setRunning(true); setResults([]); const out = [];
    for (let i = 0; i < QUERIES.length; i++) {
      const {q, t} = QUERIES[i];
      setCurrentQuery(q); setProgress(Math.round(i/QUERIES.length*100));
      try {
        const raw = await searchAndNormalizeYouTube(q, 20);
        const ranked = rankCandidates(q, raw);
        const signal = buildDiverseTVSignal(ranked, {slots:5, minYouScore:MIN_YOU_SCORE});
        const eligibleCount = ranked.filter(v => v.rawYouScore >= MIN_YOU_SCORE).length;
        const avg = signal.length>0 ? Math.round(signal.reduce((a,b)=>a+b.rawYouScore,0)/signal.length) : 0;
        const minScore = signal.length>0 ? Math.min(...signal.map(s => s.rawYouScore)) : 0;
        const maxScore = signal.length>0 ? Math.max(...signal.map(s => s.rawYouScore)) : 0;
        const topics = new Set(signal.map(v => (v as any).topic || v.whySelected.split('·')[0]?.trim() || 'general')).size;
        const sources = new Set(signal.map(v => v.channelTitle || v.channelId)).size;
        
        let metadataSum = 0;
        ranked.forEach(r => metadataSum += r.breakdown.metadataCompleteness);
        const avgMetadata = ranked.length > 0 ? (metadataSum / ranked.length) : 0;

        out.push({q,t,candidates:raw.length,eligible:eligibleCount,slots:signal.length,avg,min:minScore,max:maxScore,topics,sources,ranked,avgMetadata});
      } catch(e: any) { out.push({q,t,err:e.message}); }
      await new Promise(r=>setTimeout(r,900));
    }
    setResults(out); setRunning(false); setProgress(100); setCurrentQuery('');
  };

  const s = {bg:'#050505',white:'#e2e8f0',purple:'#a78bfa',green:'#22c55e',red:'#ef4444',muted:'#555',blue:'#3b82f6', grayBg:'#111'};

  return (
    <div style={{background:s.bg,minHeight:'100vh',color:'#fff',padding:24,fontFamily:'monospace'}}>
      <div style={{maxWidth:1100,margin:'0 auto'}}>
        <h1 style={{fontSize:'1.3rem',marginBottom:4}}>YouApp Ranking V2 — Diagnostic</h1>
        <div style={{display:'flex',gap:12,marginBottom:24}}>
          <button onClick={run} disabled={running} style={{background:running?'#333':'#7c3aed',border:'none',color:'#fff',padding:'10px 24px',borderRadius:8,cursor:running?'not-allowed':'pointer',fontWeight:700}}>
            {running ? 'Corriendo... '+progress+'% — '+currentQuery : 'Iniciar Diagnostic Test'}
          </button>
        </div>
        {results.length>0&&(<>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.85rem',marginBottom:24, textAlign:'center'}}>
            <thead><tr style={{borderBottom:'1px solid #222',color:'#666'}}><th style={{textAlign:'left',padding:'6px 4px'}}>Query</th><th style={{padding:'6px 4px'}}>Cands</th><th style={{padding:'6px 4px'}}>&gt;=60</th><th style={{padding:'6px 4px'}}>Slots</th><th style={{padding:'6px 4px'}}>Avg Metadata</th><th style={{padding:'6px 4px'}}>Acción</th></tr></thead>
            <tbody>
              {results.map((r,i)=>(
                <tr key={i} style={{borderBottom:'1px solid #111', background: expandedQuery===i ? s.grayBg : 'transparent'}}>
                  <td style={{padding:'10px 4px',color:s.white,textAlign:'left'}}>{r.q}</td>
                  <td style={{padding:'10px 4px',color:s.muted}}>{r.candidates}</td>
                  <td style={{padding:'10px 4px',color:r.eligible>=3?s.green:s.red}}>{r.eligible}</td>
                  <td style={{padding:'10px 4px',color:r.slots>=3?s.green:s.red}}>{r.slots}</td>
                  <td style={{padding:'10px 4px',color:r.avgMetadata>=0.75?s.green:s.red}}>{Math.round(r.avgMetadata*100)}%</td>
                  <td style={{padding:'10px 4px'}}>
                    <button onClick={() => setExpandedQuery(expandedQuery===i ? null : i)} style={{background:'#333',color:'#fff',border:'none',padding:'4px 8px',cursor:'pointer',borderRadius:4}}>
                      {expandedQuery===i ? 'Cerrar' : 'Inspeccionar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {expandedQuery !== null && results[expandedQuery] && (
            <div style={{background:'#0a0a0a', padding:20, borderRadius:8, border:'1px solid #222', marginTop: 24}}>
              <h2 style={{marginTop:0, color:s.purple}}>Inspección de Candidatos: {results[expandedQuery].q}</h2>
              <div style={{display:'flex', flexWrap:'wrap', gap: 16}}>
                {results[expandedQuery].ranked?.map((c: ScoredCandidate, j: number) => {
                  const bd = c.breakdown;
                  const isEligible = c.rawYouScore >= MIN_YOU_SCORE;
                  const gap = (c.rawYouScore - MIN_YOU_SCORE).toFixed(2);
                  return (
                    <div key={j} style={{background:'#111', padding: 16, borderRadius:8, border:'1px solid #333', minWidth: 320, flex:1}}>
                      <div style={{color:s.muted, marginBottom:4, fontSize:'0.8rem'}}>#{j+1} - {c.channelTitle || 'Canal desconocido'}</div>
                      <div style={{fontWeight:'bold', marginBottom: 12}}>{c.title?.slice(0,60)}</div>
                      
                      <div style={{fontSize:'0.75rem', display:'flex', flexDirection:'column', gap:8}}>
                        <div style={{background:'#1a1a1a', padding:8, borderRadius:4}}>
                          <strong style={{color:s.blue}}>METADATA</strong><br/>
                          Fecha: {bd.freshness.confidence > 0 ? '✅' : '❌'}<br/>
                          Views: {c.viewCount !== undefined ? '✅' : '❌'}<br/>
                          Duración: {c.durationSeconds !== undefined ? '✅' : '❌'}<br/>
                          Fuente conocida: {c.provider ? '✅' : '❌'}<br/>
                          Completeness: {Math.round(bd.metadataCompleteness * 100)}%
                        </div>
                        
                        <div style={{background:'#1a1a1a', padding:8, borderRadius:4}}>
                          <strong style={{color:s.purple}}>RELEVANCE ({bd.relevance.score})</strong><br/>
                          Text: {bd.relevance.textMatch}<br/>
                          Intent: {bd.relevance.intentMatch}<br/>
                          Entity: {bd.relevance.entityMatch}
                        </div>
                        
                        <div style={{background:'#1a1a1a', padding:8, borderRadius:4}}>
                          <strong style={{color:s.green}}>QUALITY ({bd.quality.score})</strong><br/>
                          Confidence: {Math.round(bd.quality.confidence)}%<br/>
                          Source: {bd.quality.source}
                        </div>
                        
                        <div style={{background:'#1a1a1a', padding:8, borderRadius:4}}>
                          <strong style={{color:s.red}}>FRESHNESS ({bd.freshness.score})</strong><br/>
                          Confidence: {Math.round(bd.freshness.confidence)}%<br/>
                          Source: {bd.freshness.source}
                        </div>
                        
                        <div style={{background:'#1a1a1a', padding:8, borderRadius:4}}>
                           Overall Confidence: {Math.round(bd.overallScoreConfidence)}%
                        </div>
                        
                        <div style={{background:'#1a1a1a', padding:8, borderRadius:4, borderLeft: isEligible ? '4px solid '+s.green : '4px solid '+s.red}}>
                           <strong>RAW YOU SCORE: {c.rawYouScore.toFixed(2)}</strong><br/>
                           MIN REQUIRED: {MIN_YOU_SCORE.toFixed(2)}<br/>
                           GAP: <span style={{color: parseFloat(gap) >= 0 ? s.green : s.red}}>{parseFloat(gap) > 0 ? '+' : ''}{gap}</span><br/>
                           ELIGIBLE: {isEligible ? '✅' : '❌'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}
