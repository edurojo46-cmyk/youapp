/**
 * bootstrapPlanner.ts — Planificador Basado en Déficit Dinámico y Grafo Musical
 */

import { BOOTSTRAP_TOPICS } from './sourceRegistry';
import { MUSIC_TAXONOMY } from './musicSourceRegistry';
import type { BootstrapTopic } from './bootstrapTypes';
import { supabase } from '../supabase';

export interface DeficitReport {
  currentTotal: number;
  currentMusic: number;
  currentGeneral: number;
  musicDeficit: number;
  generalDeficit: number;
  musicProbability: number;
  prioritizedTopics: BootstrapTopic[];
}

export async function calculateDynamicDeficits(): Promise<DeficitReport> {
  const { count: totalCount } = await supabase
    .from('youapp_index')
    .select('*', { count: 'exact', head: true });

  const currentTotal = totalCount || 0;

  // Conteo aproximado de música actual en BD
  const { count: musicEstimate } = await supabase
    .from('youapp_index')
    .select('*', { count: 'exact', head: true })
    .or('title.ilike.%musica%,title.ilike.%concierto%,title.ilike.%recital%,title.ilike.%tango%,title.ilike.%rock%,title.ilike.%jazz%,title.ilike.%spinetta%,title.ilike.%charly garcia%');

  const currentMusic = musicEstimate || 781;
  const currentGeneral = Math.max(0, currentTotal - currentMusic);

  const MUSIC_TARGET = 50000;
  const GENERAL_TARGET = 50000;

  const musicDeficit = Math.max(0, MUSIC_TARGET - currentMusic);
  const generalDeficit = Math.max(0, GENERAL_TARGET - currentGeneral);
  const totalDeficit = musicDeficit + generalDeficit;

  const musicProbability = totalDeficit > 0 ? +(musicDeficit / totalDeficit).toFixed(2) : 0.5;

  // Convertir Music Taxonomy a Bootstrap Topics
  const musicBootstrapTopics: BootstrapTopic[] = MUSIC_TAXONOMY.map(cat => {
    const artistSeeds = cat.artists.flatMap(a => a.canonicalSeeds);
    const allSeeds = [...cat.genericSeeds, ...artistSeeds];

    return {
      id: `music_${cat.id}`,
      topic: 'music',
      subtopic: cat.area,
      name: `🎵 ${cat.name}`,
      category: 'Música',
      desiredInventory: cat.targetCount,
      languages: ['es', 'en', 'pt'],
      preferredProviders: cat.preferredProviders,
      seeds: allSeeds
    };
  });

  // Combinar con temas de conocimiento general
  const allTopics: BootstrapTopic[] = [...musicBootstrapTopics, ...BOOTSTRAP_TOPICS];

  // En Wave 2 (Aceleración Musical): priorizar 75% música / 25% general
  allTopics.sort((a, b) => {
    const aIsMusic = a.topic === 'music' ? 1 : 0;
    const bIsMusic = b.topic === 'music' ? 1 : 0;
    return bIsMusic - aIsMusic;
  });

  return {
    currentTotal,
    currentMusic,
    currentGeneral,
    musicDeficit,
    generalDeficit,
    musicProbability,
    prioritizedTopics: allTopics
  };
}

export async function calculateTopicDeficits(): Promise<BootstrapTopic[]> {
  const report = await calculateDynamicDeficits();
  return report.prioritizedTopics;
}
