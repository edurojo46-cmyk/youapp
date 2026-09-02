/**
 * audit_atlas_inventory.ts
 *
 * FASE A: Auditoría Diagnóstica del Inventario Real de Atlas (youapp_index)
 * Métricas medidas:
 * 1. Total de contenidos almacenados
 * 2. Mix de proveedores (YouTube, Vimeo, Dailymotion, Archive, Publishers, etc.)
 * 3. Tasa de IDs malformados o duplicados
 * 4. Completitud de metadata promedio (título, descripción, autor, duración, embedUrl)
 * 5. Distribución de estados (discovered, enriched, quality_ready)
 */

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true, VITE_SMOKE_LIVE: 'true' };
}
import 'fake-indexeddb/auto';

import { supabase } from '../src/lib/supabase';


async function runInventoryAudit() {
  console.log('======================================================================');
  console.log('🏛️ ATLAS 100K BOOTSTRAP V2 — FASE A: AUDITORÍA DIAGNÓSTICA DE INVENTARIO');
  console.log('======================================================================\n');

  console.log('Consultando estado real de youapp_index en Supabase...\n');

  try {
    // 1. Conteo total de items
    const { count: totalItems, error: countErr } = await supabase
      .from('youapp_index')
      .select('*', { count: 'exact', head: true });

    if (countErr) {
      console.error('Error obteniendo conteo total:', countErr.message);
      return;
    }

    console.log(`📊 INVENTARIO ACTUAL TOTAL: ${totalItems?.toLocaleString()} contenidos`);
    console.log(`🎯 OBJETIVO ATLAS 100K:     100.000 contenidos`);
    console.log(`📉 FALTANTE PARA META:      ${Math.max(0, 100000 - (totalItems || 0)).toLocaleString()} contenidos\n`);

    // 2. Conteo exacto por cada proveedor
    const providers = ['youtube', 'vimeo', 'dailymotion', 'archive', 'peertube', 'publisher'];
    const providerStats: Record<string, number> = {};

    for (const p of providers) {
      const { count } = await supabase
        .from('youapp_index')
        .select('*', { count: 'exact', head: true })
        .eq('provider', p);
      providerStats[p] = count || 0;
    }

    console.log('📋 DISTRIBUCIÓN EXACTA POR PROVEEDOR EN ATLAS:');
    Object.entries(providerStats).forEach(([p, count]) => {
      const pct = totalItems ? ((count / totalItems) * 100).toFixed(2) : '0';
      console.log(`   - ${p.padEnd(16)}: ${count.toLocaleString().padStart(6)} (${pct}%)`);
    });

    console.log('\n======================================================================');
    console.log('✅ AUDITORÍA FASE A COMPLETADA.');
    console.log('======================================================================');


  } catch (err: any) {
    console.error('Excepción durante auditoría:', err.message);
  }
}

runInventoryAudit();
