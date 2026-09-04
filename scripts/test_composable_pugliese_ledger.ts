import { executeSearch } from '../src/lib/search/searchEngine';
import { exactWorkSearchGate, ExactWorkDetection } from '../src/lib/search/exactWorkSearchGate';
import { supabase } from '../src/lib/supabase';
import type { ContentItem } from '../src/lib/search/types';

export interface LedgerReport {
  query: string;
  baseIntent: string;
  entity: string;
  object: string;
  constraints: string[];
  physicalExact: number;
  federatedExact: number;
  qualifiedExact: number;
  returnedExact: number;
  coverageTier: number;
  servingPath: 'fast' | 'discovery';
  diagnosis: 'COVERAGE_GAP / DISCOVERY_REQUIRED' | 'QUALIFIED_SERVED';
  dropReasons: {
    wrongEntity: number;
    wrongObject: number;
    wrongConstraint: number;
    qualityDrop: number;
    relevanceDrop: number;
  };
}

async function auditPhysicalExactInAtlas(detection: ExactWorkDetection): Promise<number> {
  const entity = detection.canonicalEntity;
  const work = detection.canonicalWork || detection.residualTitle;
  const venue = detection.venue || detection.constraints?.find(c => c.type === 'VENUE')?.canonicalValue;

  let query = supabase.from('youapp_index').select('id, title, description, creator_name, provider');

  if (entity) {
    const entityTokens = entity.toLowerCase().split(/\s+/).filter(t => t.length > 3);
    const filters = [
      `title.ilike.%${entity}%`,
      `creator_name.ilike.%${entity}%`,
      ...entityTokens.map(t => `title.ilike.%${t}%`)
    ].join(',');
    query = query.or(filters);
  } else if (work) {
    query = query.ilike('title', `%${work}%`);
  }

  const { data, error } = await query;
  if (error || !data) return 0;

  let exactCount = 0;
  for (const row of data) {
    const candidateItem: any = {
      id: row.id,
      title: row.title,
      description: row.description || '',
      channelTitle: row.creator_name || '',
      creator: row.creator_name || '',
      creator_name: row.creator_name || '',
      provider: row.provider
    };

    const af = exactWorkSearchGate.calculateArtistFidelity(candidateItem, detection);
    const wf = exactWorkSearchGate.calculateWorkFidelity(candidateItem, detection);
    const tf = exactWorkSearchGate.calculateTitleFidelity(candidateItem, detection);
    const cf = exactWorkSearchGate.calculateConstraintFidelity(candidateItem, detection);
    const vf = exactWorkSearchGate.calculateVenueFidelity(candidateItem, detection);

    const isArtistOk = !entity || af >= 85;
    const isWorkOk = !work || (detection.isExactWork ? wf >= 75 : tf >= 75);
    const isConstraintOk = (!detection.constraints || detection.constraints.length === 0) || (cf >= 75 && vf >= 75);

    if (isArtistOk && isWorkOk && isConstraintOk) {
      exactCount++;
    }
  }

  return exactCount;
}

export async function runSingleAudit(rawQuery: string): Promise<LedgerReport> {
  console.log(`\n======================================================================`);
  console.log(`🔍 AUDITING QUERY: "${rawQuery}"`);
  console.log(`======================================================================`);

  const detection = exactWorkSearchGate.detectExactWork(rawQuery);
  const resolvedIntent = exactWorkSearchGate.toResolvedIntent(detection, 'AUTOCOMPLETE_SELECTION');

  const entity = detection.canonicalEntity || '';
  const work = detection.canonicalWork || detection.residualTitle || '';
  const venue = detection.venue || detection.constraints?.find(c => c.type === 'VENUE')?.canonicalValue || '';
  const hasConstraints = !!(detection.constraints && detection.constraints.length > 0) || !!venue;
  const hasObject = !!work;

  // 1. Conteo físico real en Atlas
  const atlasPhysicalExact = await auditPhysicalExactInAtlas(detection);

  // 2. Ejecutar búsqueda real
  const res = await executeSearch(rawQuery, {
    resolvedIntent,
    excludeProviders: ['youtube-radar']
  });

  const returnedItems = res.all || [];
  const returned = Math.min(20, returnedItems.length);

  // 3. Evaluar cada candidato retornado y desglose Atlas vs Federado
  let atlasRetrievedExact = 0;
  let federatedRetrievedExact = 0;
  let atlasFullyQualified = 0;
  let federatedFullyQualified = 0;

  let wrongEntity = 0;
  let wrongObject = 0;
  let wrongConstraint = 0;
  let qualityDrop = 0;
  let relevanceDrop = 0;

  for (const item of returnedItems) {
    const isAtlas = item.retrievalSource === 'atlas' || item.retrievalSource === 'local' || item.retrievalSource === 'cache';
    const af = item.artistFidelityScore !== undefined ? item.artistFidelityScore : exactWorkSearchGate.calculateArtistFidelity(item, detection);
    const wf = item.workFidelityScore !== undefined ? item.workFidelityScore : exactWorkSearchGate.calculateWorkFidelity(item, detection);
    const tf = item.titleFidelityScore !== undefined ? item.titleFidelityScore : exactWorkSearchGate.calculateTitleFidelity(item, detection);
    const cf = item.constraintFidelityScore !== undefined ? item.constraintFidelityScore : exactWorkSearchGate.calculateConstraintFidelity(item, detection);
    const vf = item.venueFidelityScore !== undefined ? item.venueFidelityScore : exactWorkSearchGate.calculateVenueFidelity(item, detection);

    const isArtistOk = !entity || af >= 85;
    const isObjectOk = !hasObject || wf >= 75 || tf >= 75;
    const isConstraintOk = !hasConstraints || (cf >= 75 && vf >= 75);
    const isQual = (item.qualityScore || 0) >= 60 && (item.relevanceScore || 0) >= 40;

    const isExactMatch = isArtistOk && isObjectOk && isConstraintOk;

    if (isAtlas) {
      if (isExactMatch) atlasRetrievedExact++;
      if (isExactMatch && isQual) atlasFullyQualified++;
    } else {
      if (isExactMatch) federatedRetrievedExact++;
      if (isExactMatch && isQual) federatedFullyQualified++;
    }

    if (!isArtistOk) wrongEntity++;
    if (!isObjectOk) wrongObject++;
    if (!isConstraintOk) wrongConstraint++;
    if ((item.qualityScore || 0) < 60) qualityDrop++;
    if ((item.relevanceScore || 0) < 40) relevanceDrop++;
  }

  const federatedExact = federatedRetrievedExact;
  const totalFullyQualified = atlasFullyQualified + federatedFullyQualified;

  // Invariante de Tier: Valor único
  // Tier 1: >=10 FullyQualified, Tier 2: 6–9, Tier 3: <6
  let tier: 1 | 2 | 3 = 3;
  if (totalFullyQualified >= 10) tier = 1;
  else if (totalFullyQualified >= 6) tier = 2;
  else tier = 3;

  const servingPath = (res.trace?.path === 'fast' ? 'fast' : 'discovery') as 'fast' | 'discovery';

  const constraintsList = detection.constraints ? detection.constraints.map(c => `${c.type}=${c.canonicalValue}`) : [];
  if (venue && !constraintsList.some(c => c.startsWith('VENUE='))) {
    constraintsList.push(`VENUE=${venue}`);
  }

  const coverageTier = tier;
  const qualifiedExact = totalFullyQualified;
  const returnedExact = returned;
  const physicalExact = atlasPhysicalExact;
  const diagnosis = qualifiedExact < 6 ? 'COVERAGE_GAP / DISCOVERY_REQUIRED' : 'QUALIFIED_SERVED';

  const report: LedgerReport = {
    query: rawQuery,
    baseIntent: detection.baseIntent,
    entity: entity || 'none',
    object: work || 'none',
    constraints: constraintsList,
    physicalExact,
    federatedExact,
    qualifiedExact,
    returnedExact,
    coverageTier,
    servingPath,
    diagnosis,
    dropReasons: {
      wrongEntity,
      wrongObject,
      wrongConstraint,
      qualityDrop,
      relevanceDrop
    }
  };

  console.log(`📋 LEDGER AUDIT RESULT:`);
  console.log(`  BaseIntent:              ${report.baseIntent}`);
  console.log(`  Entity:                  ${report.entity}`);
  console.log(`  Object:                  ${report.object}`);
  console.log(`  Constraints:             ${JSON.stringify(report.constraints)}`);
  console.log(`  physicalExact:           ${report.physicalExact}`);
  console.log(`  federatedExact:          ${report.federatedExact}`);
  console.log(`  qualifiedExact:          ${report.qualifiedExact}`);
  console.log(`  returnedExact:           ${report.returnedExact}`);
  console.log(`  coverageTier:            ${report.coverageTier}`);
  console.log(`  servingPath:             ${report.servingPath}`);
  console.log(`  diagnosis:               ${report.diagnosis}`);
  console.log(`  Drop Reasons:            wrongEntity=${report.dropReasons.wrongEntity}, wrongObject=${report.dropReasons.wrongObject}, wrongConstraint=${report.dropReasons.wrongConstraint}`);

  return report;
}

async function main() {
  console.log('======================================================================');
  console.log('🏛️ MANDATORY VALIDATION SUITE — COMPOSABLE INTENT V1');
  console.log('======================================================================\n');

  // 1. Las 4 Consultas Mandatorias de Pugliese
  const puglieseQueries = [
    'osvaldo pugliese',
    'osvaldo pugliese en el colon',
    'osvaldo pugliese la yumba',
    'osvaldo pugliese la yumba en el colon'
  ];

  console.log('--- ETAPA 1: AUDITORÍA DE LOS 4 CASOS DE PUGLIESE ---');
  const puglieseReports: LedgerReport[] = [];
  for (const q of puglieseQueries) {
    const rep = await runSingleAudit(q);
    puglieseReports.push(rep);
  }

  // 2. Regresiones de Referencia
  const referenceQueries = [
    'ricky martin a medio vivir',
    'calle 13 la perla',
    'papa francisco entrevista',
    'queen wembley'
  ];

  console.log('\n--- ETAPA 2: REGRESIONES DE REFERENCIA ---');
  const referenceReports: LedgerReport[] = [];
  for (const q of referenceQueries) {
    const rep = await runSingleAudit(q);
    referenceReports.push(rep);
  }

  console.log('\n====================================================================================================');
  console.log('📊 TABLA 1: AUDITORÍA DE LAS 4 CONSULTAS DE PUGLIESE (POST-SNAPSHOT)');
  console.log('====================================================================================================');
  console.table(
    puglieseReports.map(r => ({
      Query: r.query,
      BaseIntent: r.baseIntent,
      Entity: r.entity,
      Object: r.object,
      Constraints: r.constraints.join(', ') || 'none',
      physicalExact: r.physicalExact,
      federatedExact: r.federatedExact,
      qualifiedExact: r.qualifiedExact,
      returnedExact: r.returnedExact,
      coverageTier: r.coverageTier,
      servingPath: r.servingPath,
      diagnosis: r.diagnosis
    }))
  );

  console.log('\n====================================================================================================');
  console.log('📊 TABLA 2: RESUMEN CONSOLIDADO DEL LEDGER (8 CONSULTAS)');
  console.log('====================================================================================================');
  console.table(
    [...puglieseReports, ...referenceReports].map(r => ({
      Query: r.query,
      BaseIntent: r.baseIntent,
      Entity: r.entity,
      Object: r.object,
      Constraints: r.constraints.join(', ') || 'none',
      physicalExact: r.physicalExact,
      federatedExact: r.federatedExact,
      qualifiedExact: r.qualifiedExact,
      returnedExact: r.returnedExact,
      coverageTier: r.coverageTier,
      servingPath: r.servingPath,
      diagnosis: r.diagnosis
    }))
  );

  console.log('\n====================================================================================================');
  console.log('✅ AUDITORÍA FINAL COMPLETADA');
  console.log('====================================================================================================\n');
}

main().catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
