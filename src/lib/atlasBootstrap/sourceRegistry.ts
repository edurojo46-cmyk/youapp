/**
 * sourceRegistry.ts — Registro Jerárquico de Fuentes y Semillas Dirigidas para Atlas Bootstrap Wave 3C
 */

import type { BootstrapTopic } from './bootstrapTypes';

export const BOOTSTRAP_TOPICS: BootstrapTopic[] = [
  // 1. Tópico Dirigido Exclusivamente a Convertir los 13 Parciales Restantes en Suficientes
  {
    id: 'targeted_partial_deficit_queue',
    topic: 'targeted_partials',
    subtopic: 'top_13_deficit_queries',
    name: '🎯 Cola de 13 Déficits Directos del Benchmark (Conversión a Sufficient >= 95%)',
    category: 'Conocimiento General Prioritario',
    desiredInventory: 1500,
    languages: ['es', 'en'],
    preferredProviders: ['archive', 'vimeo', 'dailymotion', 'peertube'],
    seeds: [
      'ecologia ecosistemas biodiversidad biomas documental completo',
      'ecosistemas y biodiversidad ecologia biologia clase',
      'geografia continentes mapas cartografia fisica documental',
      'geografia mundial continentes oceanos relieve leccion',
      'educacion pedagogia teorias del aprendizaje constructivismo',
      'pedagogia y educacion historia modelos pedagogicos clase',
      'tratado de versalles consecuencias primera guerra mundial',
      'totalitarismo autoritarismo diferencias fascismo nazismo documental',
      'antimateria creacion laboratorio cern fisica particulas',
      'desigualdad economica indice de gini curva de lorenz explicacion',
      'aristoteles etica a nicomaco virtudes filosofia leccion',
      'demostracion matematica teorema de pitagoras geometria clase',
      'algoritmos de ordenamiento busqueda quicksort binary search',
      'viajes espaciales propulsion cohetes fisica espacial documental',
      'neorrealismo italiano ladron de bicicletas roberto rossellini cine',
      'mecanismo de anticitera computadora astronomica antigua documental'
    ]
  },

  // 2. Humanidades y Filosofía
  {
    id: 'targeted_gaps_philosophy_grammar',
    topic: 'education_foundations',
    subtopic: 'philosophy_linguistics_grammar',
    name: 'Fundamentos: Filosofía, Gramática y Lingüística',
    category: 'Educación y Humanidades',
    desiredInventory: 1500,
    languages: ['es', 'en'],
    preferredProviders: ['archive', 'dailymotion', 'vimeo', 'peertube'],
    seeds: [
      'curso introduccion a la filosofia leccion', 'gramatica espanola curso completo',
      'linguistica fonetica y fonologia clase', 'semantica y sintaxis espanol clase',
      'filosofia logica proposicional leccion', 'teoria de la comunicacion y el lenguaje'
    ]
  }
];
