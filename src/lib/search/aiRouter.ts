import type { SearchQuery } from './types';

export type QueryComplexity = 'simple' | 'conceptual' | 'complex';

export function determineQueryComplexity(query: SearchQuery): QueryComplexity {
  const q = query.normalizedQuery.toLowerCase();
  const words = q.split(' ').filter(w => w.length > 2);

  // Reglas heurísticas rápidas

  // 1. Complejas: Preguntas explícitas, comparaciones, solicitudes de explicación profunda
  const complexKeywords = ['por qué', 'por que', 'diferencia', 'comparar', 'ventajas', 'desventajas', 'explicar', 'opiniones', 'perspectivas', 'qué es', 'que es', 'cómo', 'como'];
  if (complexKeywords.some(kw => q.includes(kw)) || words.length > 6) {
    return 'complex';
  }

  // 2. Conceptuales: Búsquedas temáticas abstractas
  const conceptualKeywords = ['historia', 'documental', 'ciencia', 'filosofía', 'teoría', 'futuro', 'mejores', 'aprender', 'entender'];
  if (conceptualKeywords.some(kw => q.includes(kw)) || words.length >= 4) {
    return 'conceptual';
  }

  // 3. Simples: Entidades exactas, zapping, nombres propios ("Messi goles", "Cerati en vivo")
  return 'simple';
}
