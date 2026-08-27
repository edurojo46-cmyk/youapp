import { useState, useEffect } from 'react';
import { executeSearch } from '../lib/search/searchEngine';
import type { ContentItem } from '../lib/search/types';
import { Play, Check, X, RefreshCw, BarChart } from 'lucide-react';

const TEST_QUERIES = [
  "Historia Argentina",
  "Perón",
  "mejores documentales del espacio",
  "aprender inteligencia artificial",
  "Cerati en vivo",
  "entrevista Borges",
  "economía argentina",
  "física cuántica para principiantes"
];

interface TestResult {
  query: string;
  items: ContentItem[];
  latency: number;
  ratings: Record<string, number>; // id -> rating (2: Excellent, 1: Acceptable, 0: Bad)
}

export default function SearchLab() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const runSuite = async () => {
    setIsRunning(true);
    setResults([]);
    setCurrentIndex(0);

    const newResults: TestResult[] = [];
    for (const q of TEST_QUERIES) {
      const start = Date.now();
      // forceExternal = true to bypass cache and really test retrieval
      const searchRes = await executeSearch(q, true);
      
      newResults.push({
        query: q,
        items: searchRes.all.slice(0, 20),
        latency: Date.now() - start,
        ratings: {}
      });
      setResults([...newResults]);
    }
    
    setIsRunning(false);
  };

  const setRating = (queryIdx: number, itemId: string, rating: number) => {
    const newResults = [...results];
    newResults[queryIdx].ratings[itemId] = rating;
    setResults(newResults);
  };

  const currentTest = results[currentIndex];

  const calculateMetrics = () => {
    let totalPrecision5 = 0;
    let totalPrecision10 = 0;
    let queriesEvaluated = 0;

    results.forEach(r => {
      const ratedItems = Object.keys(r.ratings).length;
      if (ratedItems === 0) return;
      queriesEvaluated++;

      let p5Score = 0;
      let p10Score = 0;

      r.items.slice(0, 10).forEach((item, idx) => {
        const rating = r.ratings[item.id] || 0;
        const isGood = rating > 0 ? 1 : 0;
        if (idx < 5) p5Score += isGood;
        p10Score += isGood;
      });

      totalPrecision5 += (p5Score / 5);
      totalPrecision10 += (p10Score / 10);
    });

    if (queriesEvaluated === 0) return { p5: 0, p10: 0 };
    return {
      p5: Math.round((totalPrecision5 / queriesEvaluated) * 100),
      p10: Math.round((totalPrecision10 / queriesEvaluated) * 100)
    };
  };

  const metrics = calculateMetrics();

  return (
    <div style={{ padding: '2rem', color: 'white', maxWidth: '1000px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1>Search Lab V2.1</h1>
          <p style={{ opacity: 0.7 }}>Evaluación humana del ranking (Precision@K)</p>
        </div>
        <button 
          onClick={runSuite}
          disabled={isRunning}
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--neon-purple)', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {isRunning ? <RefreshCw className="spin-animation" size={18} /> : <Play size={18} fill="currentColor" />}
          Ejecutar Dataset ({TEST_QUERIES.length})
        </button>
      </header>

      {results.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '2rem' }}>
          
          {/* Sidebar */}
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '12px', height: 'fit-content' }}>
            <h3>Consultas</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
              {results.map((r, idx) => {
                const ratedCount = Object.keys(r.ratings).length;
                return (
                  <button 
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    style={{ 
                      textAlign: 'left', 
                      padding: '0.75rem', 
                      background: currentIndex === idx ? 'rgba(255,255,255,0.1)' : 'transparent',
                      border: '1px solid',
                      borderColor: currentIndex === idx ? 'var(--neon-cyan)' : 'transparent',
                      color: 'white', 
                      borderRadius: '6px', 
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                      {r.query}
                    </span>
                    {ratedCount > 0 && <span style={{ opacity: 0.5, fontSize: '0.8rem' }}>{ratedCount}/20</span>}
                  </button>
                )
              })}
            </div>

            <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <h4 style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}><BarChart size={16} /> Métricas Globales</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
                <span>Precision@5</span>
                <strong>{metrics.p5}%</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                <span>Precision@10</span>
                <strong>{metrics.p10}%</strong>
              </div>
            </div>
          </div>

          {/* Main Panel */}
          {currentTest && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
                <h2>Resultados para "{currentTest.query}"</h2>
                <span style={{ background: 'rgba(0,0,0,0.5)', padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.85rem' }}>Latencia: {currentTest.latency}ms</span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {currentTest.items.map((item, idx) => {
                  const rating = currentTest.ratings[item.id];
                  
                  return (
                    <div key={item.id} style={{ display: 'flex', gap: '1rem', background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', borderLeft: `3px solid ${rating === 2 ? '#10b981' : rating === 1 ? '#f59e0b' : rating === 0 ? '#ef4444' : 'transparent'}` }}>
                      <div style={{ fontWeight: 'bold', opacity: 0.5, width: '25px' }}>#{idx + 1}</div>
                      <img src={item.thumbnail} alt="" style={{ width: '120px', height: '68px', objectFit: 'cover', borderRadius: '4px' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h4 style={{ margin: '0 0 0.25rem 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</h4>
                        <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.6 }}>{item.channelTitle} • YS: {item.youScore?.toFixed(1)} (Q: {item.qualityScore?.toFixed(0)} | R: {item.relevanceScore?.toFixed(0)})</p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button 
                          onClick={() => setRating(currentIndex, item.id, 2)}
                          style={{ background: rating === 2 ? '#10b981' : 'rgba(255,255,255,0.1)', border: 'none', padding: '0.5rem', borderRadius: '4px', color: 'white', cursor: 'pointer' }}
                          title="Excelente"
                        ><Check size={16} /></button>
                        <button 
                          onClick={() => setRating(currentIndex, item.id, 1)}
                          style={{ background: rating === 1 ? '#f59e0b' : 'rgba(255,255,255,0.1)', border: 'none', padding: '0.5rem', borderRadius: '4px', color: 'white', cursor: 'pointer' }}
                          title="Aceptable"
                        ><span style={{ fontWeight: 'bold' }}>~</span></button>
                        <button 
                          onClick={() => setRating(currentIndex, item.id, 0)}
                          style={{ background: rating === 0 ? '#ef4444' : 'rgba(255,255,255,0.1)', border: 'none', padding: '0.5rem', borderRadius: '4px', color: 'white', cursor: 'pointer' }}
                          title="Malo"
                        ><X size={16} /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
