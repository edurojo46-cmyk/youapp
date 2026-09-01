import { useState, useCallback, useEffect } from 'react';
import type { ContentItem } from '../lib/search/types';

interface StableSearchResultsOptions {
  reorderThreshold?: number;
  entryThreshold?: number;
  freezeAfterInteraction?: boolean;
}

export function useStableSearchResults(
  rankedResults: ContentItem[],
  options?: StableSearchResultsOptions
) {
  const [visibleResults, setVisibleResults] = useState<ContentItem[]>([]);
  const [pendingResults, setPendingResults] = useState<ContentItem[]>([]);
  const [isFrozen, setIsFrozen] = useState(false);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  const moveThreshold = options?.reorderThreshold ?? 8;
  const entryThreshold = options?.entryThreshold ?? 5;

  useEffect(() => {
    // Si no hay resultados visibles, los aceptamos todos inmediatamente
    if (visibleResults.length === 0) {
      setVisibleResults(rankedResults);
      return;
    }

    if (isFrozen) {
      // Guardamos la última "verdad matemática" en pending
      setPendingResults(rankedResults);
      return;
    }

    // Lógica de estabilización
    const nextVisible = [...visibleResults];
    let changed = false;

    // Mapa de posiciones actuales para búsqueda rápida
    const currentPositions = new Map(visibleResults.map((item, index) => [item.id, index]));
    const currentScores = new Map(visibleResults.map(item => [item.id, item.youScore || 0]));

    for (let i = 0; i < rankedResults.length; i++) {
      const newItem = rankedResults[i];
      const currentPos = currentPositions.get(newItem.id);
      const newScore = newItem.youScore || 0;

      if (currentPos !== undefined) {
        // Ya estaba visible. ¿Merece saltar de posición hacia arriba?
        if (currentPos > i && currentPos !== -1) {
          const oldScore = currentScores.get(newItem.id) || 0;
          if (newScore > oldScore + moveThreshold && newItem.id !== activeItemId) {
            // Remove from old pos
            nextVisible.splice(currentPos, 1);
            // Insert at new pos
            nextVisible.splice(i, 0, newItem);
            changed = true;
            // Update map
            currentPositions.set(newItem.id, i);
          }
        }
      } else {
        // Es un resultado nuevo.
        // Comparamos con el score del elemento que está ocupando su lugar (si hay alguno)
        const occupantScore = nextVisible[i]?.youScore || 0;
        if (newScore > occupantScore + entryThreshold && nextVisible[i]?.id !== activeItemId) {
          nextVisible.splice(i, 0, newItem);
          changed = true;
        } else {
          // Si no supera el threshold, lo metemos al final para no molestar
          nextVisible.push(newItem);
          changed = true;
        }
      }
    }

    // Limitar a los 20 mejores (o el tamaño original)
    if (nextVisible.length > 20) {
      nextVisible.length = 20;
      changed = true;
    }

    if (changed) {
      // Forzamos actualización de referencia para React
      setVisibleResults([...nextVisible]);
    }
  }, [rankedResults, isFrozen, activeItemId, moveThreshold, entryThreshold]);

  const interact = useCallback((itemId?: string) => {
    if (options?.freezeAfterInteraction) {
      setIsFrozen(true);
    }
    if (itemId) {
      setActiveItemId(itemId);
    }
  }, [options?.freezeAfterInteraction]);

  const releaseInteraction = useCallback(() => {
    setActiveItemId(null);
  }, []);

  const applyPendingUpdates = useCallback(() => {
    if (pendingResults.length > 0) {
      setVisibleResults(pendingResults);
      setPendingResults([]);
    }
    setIsFrozen(false);
  }, [pendingResults]);

  const reset = useCallback(() => {
    setVisibleResults([]);
    setPendingResults([]);
    setIsFrozen(false);
    setActiveItemId(null);
  }, []);

  // Determinar si hay actualizaciones sustanciales pendientes
  // Comparamos las IDs del top 5, por ejemplo, para saber si vale la pena avisar
  const hasUpdates = pendingResults.length > 0 && 
    (pendingResults[0]?.id !== visibleResults[0]?.id || 
     pendingResults.length > visibleResults.length);

  return {
    visibleResults,
    hasUpdates,
    interact,
    releaseInteraction,
    applyPendingUpdates,
    reset
  };
}
