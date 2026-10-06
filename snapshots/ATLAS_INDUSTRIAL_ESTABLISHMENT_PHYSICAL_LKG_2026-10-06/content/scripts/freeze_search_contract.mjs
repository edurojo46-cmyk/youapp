import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const INDEX_UID = 'atlas_people_discovery_gate32_delta';

async function freezeContract() {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.MEILI_MASTER_KEY) {
    headers['Authorization'] = `Bearer ${process.env.MEILI_MASTER_KEY}`;
  }

  // 1. Fetch index details (primaryKey, etc.)
  const idxRes = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}`, { headers });
  if (!idxRes.ok) throw new Error(`Failed to fetch index: ${idxRes.statusText}`);
  const idxData = await idxRes.json();

  // 2. Fetch full settings
  const setRes = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/settings`, { headers });
  if (!setRes.ok) throw new Error(`Failed to fetch settings: ${setRes.statusText}`);
  const settingsData = await setRes.json();

  // 3. Assemble canonical contract
  const contract = {
    indexUid: INDEX_UID,
    primaryKey: idxData.primaryKey,
    displayedAttributes: settingsData.displayedAttributes,
    searchableAttributes: settingsData.searchableAttributes,
    filterableAttributes: settingsData.filterableAttributes,
    sortableAttributes: settingsData.sortableAttributes,
    rankingRules: settingsData.rankingRules,
    stopWords: settingsData.stopWords,
    nonSeparatorTokens: settingsData.nonSeparatorTokens,
    separatorTokens: settingsData.separatorTokens,
    dictionary: settingsData.dictionary,
    synonyms: settingsData.synonyms,
    distinctAttribute: settingsData.distinctAttribute,
    proximityPrecision: settingsData.proximityPrecision,
    typoTolerance: settingsData.typoTolerance,
    faceting: settingsData.faceting,
    pagination: settingsData.pagination,
    searchCutoffMs: settingsData.searchCutoffMs,
    localizedAttributes: settingsData.localizedAttributes,
    facetSearch: settingsData.facetSearch,
    prefixSearch: settingsData.prefixSearch,
  };

  // Canonical JSON serialization (sorted keys)
  const canonicalString = JSON.stringify(contract, Object.keys(contract).sort(), 2);
  const sha256 = crypto.createHash('sha256').update(canonicalString).digest('hex');

  const output = {
    contract,
    sha256,
    frozenAt: new Date().toISOString(),
    sourceIndex: INDEX_UID,
    endpoint: MEILI_URL,
  };

  const outputPath = path.resolve('reports/atlas/search/search_frozen_contract.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`✅ Search Contract frozen successfully!`);
  console.log(`SEARCH_FROZEN_CONTRACT_SHA256: ${sha256}`);
  console.log(`Saved to: ${outputPath}`);
}

freezeContract().catch(err => {
  console.error('Error freezing search contract:', err);
  process.exit(1);
});
