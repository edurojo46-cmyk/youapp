/**
 * Atlas Demand Radar V1 — Commercial Intent Lexicon & Semantic Scorer
 * 3-Level Detection: Lexical, Semantic, Behavioral + Negative Intent Discounts
 */

import type { CommercialIntentAnalysis } from './types';

export const POSITIVE_COMMERCIAL_TOKENS = {
  DIRECT_PURCHASE: [
    'comprar', 'compra', 'compro', 'precio', 'precios', 'costo', 'valor',
    'cuotas', 'sin interes', 'envio', 'envios', 'despacho', 'oferta', 'ofertas',
    'descuento', 'descuentos', 'promo', 'promocion', 'rebaja', 'barato', 'barata',
    'donde comprar', 'tienda', 'catalogo', 'stock', 'disponible', 'mercadolibre',
    'envio gratis', 'envios gratis', 'flete gratis'
  ],
  COMPARISON_DECISION: [
    'mejor', 'mejores', 'top', 'vs', 'versus', 'comparativa', 'comparacion',
    'cual comprar', 'que comprar', 'conviene', 'vale la pena', 'recomendado',
    'recomendados', 'recomendacion', 'guia de compra', 'unboxing', 'review',
    'analisis', 'opiniones', 'rendimiento', 'calidad precio'
  ],
  TECHNICAL_SPEC_PURCHASE: [
    '1hp', '2hp', '1/2hp', '3500w', '220v', '110v', '16gb', '32gb', '64gb',
    '128gb', '256gb', '512gb', '1tb', '2tb', 'rtx', 'gtx', 'i5', 'i7', 'i9',
    'ryzen', 'oled', 'qled', '4k', 'inverter', 'inalambrico', 'portatil'
  ]
};

export const NEGATIVE_COMMERCIAL_TOKENS = {
  ACADEMIC_HISTORICAL: [
    'historia', 'historico', 'historica', 'biografia', 'origen', 'quien fue',
    'que significa', 'significado', 'definicion', 'concepto', 'tesis', 'ensayo',
    'investigacion', 'documental', 'evolucion historica'
  ],
  PIRACY_FREEBIE: [
    'crack', 'crackeado', 'torrent', 'pirata', 'pirateado',
    'descargar gratis', 'descarga directa', 'key generator', 'serial', 'keygen',
    'curso gratis', 'juego gratis', 'pdf gratis', 'programa gratis'
  ],
  DIY_REPAIR_MANUAL: [
    'como arreglar', 'reparar', 'reparacion', 'arreglo', 'manual de usuario',
    'manual de servicio', 'diagrama', 'desarmar', 'repuesto casero', 'solucion error'
  ],
  VIRAL_MEME_ENTERTAINMENT: [
    'meme', 'memes', 'viral', 'parodia', 'bloopers', 'humor', 'gracioso',
    'reaccion', 'fails', 'compilacion', 'tiktok trend'
  ],
  NEGATIVE_WARNING: [
    'por que no comprar', 'por qué no comprar', 'no compres', 'no comprar',
    'mala experiencia', 'estafa', 'fraude', 'decepcion', 'falla de fabrica',
    'peor', 'pesimo', 'arruinado'
  ]
};

/**
 * Normalizes query string (strips accents, lowercases, removes excess whitespace)
 */
export function normalizeQueryString(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s\d.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Analyzes query text across lexical positive signals and negative intent discounts.
 */
export function analyzeCommercialIntent(rawQuery: string): CommercialIntentAnalysis {
  const normalized = normalizeQueryString(rawQuery);
  const positiveFound: string[] = [];
  const negativeFound: string[] = [];
  const modifiers: string[] = [];

  // Check if query has "envio gratis" / "flete gratis" to prevent standalone "gratis" false negative
  const hasFreeShipping = normalized.includes('envio gratis') || normalized.includes('flete gratis') || normalized.includes('envios gratis');

  // 1. Scan for explicit Negative Warnings first (Phrase matching)
  for (const warning of NEGATIVE_COMMERCIAL_TOKENS.NEGATIVE_WARNING) {
    if (normalized.includes(warning)) {
      negativeFound.push(warning);
    }
  }

  // 2. Scan for Academic / Piracy / DIY / Meme negatives
  const negativeCategories = [
    ...NEGATIVE_COMMERCIAL_TOKENS.ACADEMIC_HISTORICAL,
    ...NEGATIVE_COMMERCIAL_TOKENS.PIRACY_FREEBIE,
    ...NEGATIVE_COMMERCIAL_TOKENS.DIY_REPAIR_MANUAL,
    ...NEGATIVE_COMMERCIAL_TOKENS.VIRAL_MEME_ENTERTAINMENT
  ];

  for (const neg of negativeCategories) {
    // Word boundary match
    const regex = new RegExp(`\\b${neg}\\b`, 'i');
    if (regex.test(normalized)) {
      negativeFound.push(neg);
    }
  }

  // Check standalone "gratis" if NOT free shipping
  if (!hasFreeShipping && /\bgratis\b/i.test(normalized)) {
    negativeFound.push('gratis');
  }

  // 3. Scan for Direct Purchase positives
  for (const pos of POSITIVE_COMMERCIAL_TOKENS.DIRECT_PURCHASE) {
    const regex = new RegExp(`\\b${pos}\\b`, 'i');
    if (regex.test(normalized)) {
      positiveFound.push(pos);
      modifiers.push(pos);
    }
  }

  // 4. Scan for Comparison / Decision positives
  for (const comp of POSITIVE_COMMERCIAL_TOKENS.COMPARISON_DECISION) {
    const regex = new RegExp(`\\b${comp}\\b`, 'i');
    if (regex.test(normalized)) {
      positiveFound.push(comp);
      modifiers.push(comp);
    }
  }

  // 5. Scan for Technical Spec indicators
  for (const spec of POSITIVE_COMMERCIAL_TOKENS.TECHNICAL_SPEC_PURCHASE) {
    const regex = new RegExp(`\\b${spec}\\b`, 'i');
    if (regex.test(normalized)) {
      positiveFound.push(spec);
    }
  }

  // Deduplicate matches
  const uniquePositive = Array.from(new Set(positiveFound));
  const uniqueNegative = Array.from(new Set(negativeFound));

  // 6. Base Score Calculation
  let baseScore = 0;
  if (uniquePositive.length === 0) {
    const words = normalized.split(/\s+/).filter(w => w.length > 3);
    baseScore = words.length >= 2 ? 20 : 10;
  } else {
    // 40 base for 1 token, +15 for each additional positive token up to 98
    baseScore = Math.min(98, 40 + (uniquePositive.length * 15));
  }

  // 7. Negative Intent Discount
  let discount = 0;
  for (const neg of uniqueNegative) {
    if (NEGATIVE_COMMERCIAL_TOKENS.NEGATIVE_WARNING.includes(neg)) {
      discount += 60; // Severe penalty for "por que no comprar" / "estafa"
    } else if (NEGATIVE_COMMERCIAL_TOKENS.PIRACY_FREEBIE.includes(neg) || neg === 'gratis') {
      discount += 70; // Crack / torrent / curso gratis
    } else if (NEGATIVE_COMMERCIAL_TOKENS.ACADEMIC_HISTORICAL.includes(neg)) {
      discount += 45; // Historia / biografia / tesis
    } else if (NEGATIVE_COMMERCIAL_TOKENS.DIY_REPAIR_MANUAL.includes(neg)) {
      discount += 40; // Reparar / manual
    } else if (NEGATIVE_COMMERCIAL_TOKENS.VIRAL_MEME_ENTERTAINMENT.includes(neg)) {
      discount += 50; // Meme / viral / bloopers
    }
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(baseScore - discount)));

  let intentLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' = 'NONE';
  if (finalScore >= 70) intentLevel = 'HIGH';
  else if (finalScore >= 45) intentLevel = 'MEDIUM';
  else if (finalScore >= 20) intentLevel = 'LOW';

  const isCommerciallyViable = finalScore >= 40 && !uniqueNegative.some(n => NEGATIVE_COMMERCIAL_TOKENS.PIRACY_FREEBIE.includes(n) || n === 'gratis');

  let explanation = `Positive tokens: [${uniquePositive.join(', ') || 'none'}]. Negative tokens: [${uniqueNegative.join(', ') || 'none'}].`;
  if (uniqueNegative.length > 0) {
    explanation += ` Discount applied: -${discount} pts due to non-commercial / informational context.`;
  }

  return {
    raw_query: rawQuery,
    commercial_intent_score: finalScore,
    positive_tokens_found: uniquePositive,
    negative_tokens_found: uniqueNegative,
    is_commercially_viable: isCommerciallyViable,
    intent_level: intentLevel,
    intent_modifiers: Array.from(new Set(modifiers)),
    explanation
  };
}
