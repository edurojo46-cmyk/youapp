import { supabase } from '../supabase';
import type { SearchQuery, ContentItem, AiOverview } from './types';

// The Edge Function consolidates actions: 'research', 'embed', 'rerank', 'overview'

export async function generateAiResearch(prompt: string): Promise<{ channelId: string, cached: boolean, title: string, error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('ai-gateway', {
      body: { action: 'research', prompt }
    });
    
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    
    return data;
  } catch (err: any) {
    console.error('generateAiResearch error:', err);
    return { channelId: '', cached: false, title: '', error: err.message };
  }
}

export async function generateAiEmbeddings(texts: string[]): Promise<number[][] | null> {
  /*
  try {
    const { data, error } = await supabase.functions.invoke('ai-gateway', {
      body: { action: 'embed', texts }
    });
    
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    
    return data.embeddings;
  } catch (err) {
    console.error('generateAiEmbeddings error:', err);
    return null;
  }
  */
  return texts.map(() => new Array(384).fill(0.1));
}

export async function generateAiRerank(query: SearchQuery, candidates: ContentItem[]): Promise<Record<string, { relevance: number, reasoning?: string }> | null> {
  const result: Record<string, { relevance: number, reasoning?: string }> = {};
  candidates.forEach(c => {
    result[c.id] = { relevance: 0.5, reasoning: 'mock' };
  });
  return result;
}

export async function generateAiOverview(query: SearchQuery, topItems: ContentItem[]): Promise<AiOverview | null> {
  try {
    const { data, error } = await supabase.functions.invoke('ai-gateway', {
      body: { action: 'overview', query: query.rawQuery, topItems }
    });
    
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    
    return {
      text: data.text,
      generatedAt: Date.now(),
      sourceContentIds: data.sourceContentIds || [],
      modelVersion: 'gemini-3.7-flash'
    };
  } catch (err) {
    console.error('generateAiOverview error:', err);
    return null;
  }
}
