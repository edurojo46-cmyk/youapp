import type { SearchQuery, ContentItem, AiOverview } from './types';
import { generateAiEmbeddings, generateAiRerank, generateAiOverview as generateAiOverviewClient } from './aiClient';

// Helper to compute cosine similarity locally if we already have vectors
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function applySemanticScoring(query: SearchQuery, items: ContentItem[]): Promise<ContentItem[]> {
  try {
    // We send the query and the items' texts to the edge function.
    // The edge function will return the query embedding and the items embeddings.
    // Or, for simplicity and performance, we can just send everything to a Supabase RPC
    // if they are cached, but since we might have new items from YouTube, we will get their embeddings.
    
    // 1. Prepare texts for embedding
    const texts = [
      query.normalizedQuery,
      ...items.map(item => `${item.title} ${item.description || ''}`)
    ];

    let embeddingsData;
    
    const embeddings = await generateAiEmbeddings(texts);
    
    if (!embeddings) {
      console.warn('AI Embeddings fallback activated due to edge function error');
      // Mock embeddings (random vectors of size 384)
      embeddingsData = {
        embeddings: Array(texts.length).fill(0).map(() => 
          Array(384).fill(0).map(() => Math.random() * 2 - 1)
        )
      };
    } else {
      embeddingsData = { embeddings };
    }

    if (!embeddingsData || !embeddingsData.embeddings) {
      console.warn('Semantic scoring failed, falling back to base ranking');
      return items;
    }

    const queryEmbedding = embeddingsData.embeddings[0];
    const itemEmbeddings = embeddingsData.embeddings.slice(1);

    // 3. Calculate similarity and merge into youScore
    return items.map((item, index) => {
      const similarity = cosineSimilarity(queryEmbedding, itemEmbeddings[index]);
      // Normalize cosine similarity from [-1, 1] to [0, 100]
      const semanticScore = Math.max(0, (similarity + 1) / 2) * 100;
      
      // Merge with existing youScore (40% semantic, 60% base)
      const baseScore = item.youScore || 50;
      const newYouScore = (semanticScore * 0.4) + (baseScore * 0.6);

      return {
        ...item,
        semanticScore,
        youScore: newYouScore
      };
    }).sort((a, b) => (b.youScore || 0) - (a.youScore || 0));

  } catch (err) {
    console.error('applySemanticScoring error:', err);
    return items;
  }
}

export async function applyAiReranking(query: SearchQuery, items: ContentItem[]): Promise<ContentItem[]> {
  try {
    let rerankData;
    
    const aiScores = await generateAiRerank(query, items);
    
    if (!aiScores) {
      console.warn('AI Reranker fallback activated due to edge function error');
      // Mock rerank scores (random between 50 and 95)
      const mockScores: Record<string, any> = {};
      items.forEach(item => {
        mockScores[item.id] = { relevance: Math.floor(Math.random() * 45) + 50 };
      });
      rerankData = { scores: mockScores };
    } else {
      rerankData = { scores: aiScores };
    }

    if (!rerankData || !rerankData.scores) {
      console.warn('AI Reranking failed, falling back');
      return items;
    }

    const finalScores = rerankData.scores;
    
    return items.map(item => {
      const aiEval = finalScores[item.id];
      if (aiEval && typeof aiEval.relevance === 'number') {
        const aiScore = aiEval.relevance;
        // AI score strongly influences the final score
        const newYouScore = ((item.youScore || 50) * 0.3) + (aiScore * 0.7);
        return {
          ...item,
          aiScore,
          youScore: newYouScore
        };
      }
      return item;
    }).sort((a, b) => (b.youScore || 0) - (a.youScore || 0));

  } catch (err) {
    console.error('applyAiReranking error:', err);
    return items;
  }
}

export async function generateAiOverview(query: SearchQuery, topItems: ContentItem[]): Promise<AiOverview | null> {
  try {
    let overviewData;

    const data = await generateAiOverviewClient(query, topItems);

    if (!data) {
      console.warn('AI Overview fallback activated due to edge function error');
      // Mock AI Overview
      await new Promise(resolve => setTimeout(resolve, 800)); // Latencia AI simulada
      overviewData = {
        text: `**Resumen generado por IA (MOCK)**: Basado en tu búsqueda sobre "${query.rawQuery}", hemos encontrado contenido muy relevante en nuestro catálogo. Los resultados principales incluyen videos y canales que cubren este tema en profundidad. Te recomendamos explorar las primeras opciones sugeridas.`,
        sourceContentIds: topItems.slice(0, 3).map(i => i.id)
      };
    } else {
      overviewData = data;
    }

    if (!overviewData || !overviewData.text) {
      console.warn('AI Overview failed');
      return null;
    }

    return {
      text: overviewData.text,
      generatedAt: Date.now(),
      sourceContentIds: overviewData.sourceContentIds || [],
      modelVersion: 'gemini-1.5-flash-mock'
    };
  } catch (err) {
    console.error('generateAiOverview error:', err);
    return null;
  }
}
