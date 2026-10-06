/**
 * musicSourceRegistry.ts — Registro de Vetas de Alta Entropía para el Cierre Definitivo de Atlas 50K (+1.056 Contenidos)
 */

import type { MusicSubgenreCategory } from './musicGraphTypes';

export const MUSIC_TAXONOMY: MusicSubgenreCategory[] = [
  // 1. Krautrock Cósmico, Kosmische Musik & Motorik (Can, Neu!, Faust, Cluster)
  {
    id: 'krautrock_kosmische_can_neu',
    name: 'Krautrock Cósmico, Motorik & Kosmische Musik',
    area: 'Krautrock / Experimental / 70s',
    targetCount: 2000,
    description: 'Can, Neu!, Faust, Cluster, Harmonia, Popol Vuh, Agitation Free en vivo.',
    preferredProviders: ['dailymotion', 'vimeo', 'archive', 'peertube'],
    artists: [
      {
        id: 'can_neu',
        name: 'Can & Neu!',
        country: 'DE',
        era: '1970s',
        genres: ['Krautrock', 'Motorik'],
        bandsAndProjects: ['Can', 'Neu!'],
        influences: ['Stockhausen', 'Velvet Underground'],
        relatedArtists: ['Michael Rother', 'Klaus Dinger', 'Holger Czukay'],
        movements: ['Krautrock'],
        canonicalSeeds: [
          'Can live at Paris Bataclan 1973 full concert recording',
          'Neu! Klaus Dinger Michael Rother studio recording session',
          'Faust live in London 1973 concert avant-rock'
        ]
      }
    ],
    genericSeeds: [
      'Krautrock live concert recording vintage television broadcast',
      'Kosmische Musik analog synthesizer live performance archive'
    ]
  },

  // 2. Música Tradicional Japonesa, Koto, Shamisen & Shakuhachi
  {
    id: 'japanese_traditional_koto_shakuhachi',
    name: 'Música Tradicional Japonesa, Shakuhachi, Koto & Gagaku',
    area: 'Tradición / Instrumental / Japón',
    targetCount: 2000,
    description: 'Shakuhachi solo, Koto tradicional, Gagaku imperial, Biwa recitales acústicos.',
    preferredProviders: ['dailymotion', 'vimeo', 'archive', 'peertube'],
    artists: [
      {
        id: 'traditional_japan',
        name: 'Maestros del Shakuhachi y Koto',
        country: 'JP',
        era: 'Tradicional-Siglo XX',
        genres: ['Gagaku', 'Shakuhachi', 'Hokyoku'],
        bandsAndProjects: ['Solistas'],
        influences: ['Zen'],
        relatedArtists: ['Kohachiro Miyata', 'Kimio Eto'],
        movements: ['Música Tradicional Japonesa'],
        canonicalSeeds: [
          'Shakuhachi flute solo meditation acoustic temple live recording',
          'Traditional Japanese Koto recital concert performance live',
          'Gagaku imperial court orchestra traditional acoustic live'
        ]
      }
    ],
    genericSeeds: [
      'Japanese traditional music shakuhachi koto live performance',
      'Shamisen traditional solo acoustic recital concert recording'
    ]
  },

  // 3. Música Celta Tradicional, Gaitas Escocesas & Arpa Irlandesa
  {
    id: 'celtic_traditional_harp_bagpipe',
    name: 'Música Tradicional Celta, Arpa Irlandesa & Gaitas',
    area: 'Folk Celta / Tradicional / Acústico',
    targetCount: 2000,
    description: 'The Chieftains, Planxty, Clannad, Alan Stivell arpa celta, recitales en vivo.',
    preferredProviders: ['dailymotion', 'vimeo', 'archive', 'peertube'],
    artists: [
      {
        id: 'the_chieftains_planxty',
        name: 'The Chieftains & Alan Stivell',
        country: 'IE/FR',
        era: '1970s-2000s',
        genres: ['Celtic Folk', 'Traditional Irish'],
        bandsAndProjects: ['The Chieftains', 'Planxty'],
        influences: ['Folk Gaélico'],
        relatedArtists: ['Paddy Moloney', 'Christy Moore'],
        movements: ['Música Celta'],
        canonicalSeeds: [
          'The Chieftains live in Montreux 1982 traditional Irish concert',
          'Alan Stivell a l Olympia 1972 Celtic harp live concert',
          'Planxty live in Dublin 1973 traditional folk session'
        ]
      }
    ],
    genericSeeds: [
      'Traditional Irish folk music session live acoustic pub concert',
      'Celtic harp acoustic solo recital performance live recording',
      'Scottish traditional bagpipe and drums pipe band live recording'
    ]
  },

  // 4. Jazz Flamenco & Fusión Ibérica
  {
    id: 'flamenco_jazz_iberian_fusion',
    name: 'Flamenco Jazz & Fusión Ibérica (Jorge Pardo, Chano Domínguez)',
    area: 'Flamenco Jazz / Fusión',
    targetCount: 2000,
    description: 'Jorge Pardo (flauta/saxo), Chano Domínguez (piano flamenco), Carles Benavent (bajo), Pedro Iturralde.',
    preferredProviders: ['dailymotion', 'vimeo', 'archive', 'peertube'],
    artists: [
      {
        id: 'jorge_pardo_chano',
        name: 'Jorge Pardo & Chano Domínguez',
        country: 'ES',
        era: '1980s-2010s',
        genres: ['Flamenco Jazz', 'Fusión'],
        bandsAndProjects: ['Solistas', 'Sexteto de Paco'],
        influences: ['Bebop', 'Flamenco'],
        relatedArtists: ['Carles Benavent', 'Rubem Dantas'],
        movements: ['Jazz Flamenco'],
        canonicalSeeds: [
          'Jorge Pardo flauta flamenca y jazz recital en vivo festival',
          'Chano Dominguez piano flamenco jazz trio concierto en directo',
          'Pedro Iturralde y Paco de Lucia Jazz Flamenco grabacion historica'
        ]
      }
    ],
    genericSeeds: [
      'Flamenco jazz live concert festival flute saxophone piano trio',
      'Spanish jazz fusion live performance soundboard recording'
    ]
  }
];
