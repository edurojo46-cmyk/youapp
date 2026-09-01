// Calculate NDCG@K
export function calculateNDCG(
  candidates: { id: string }[],
  judgments: Record<string, number>,
  k: number = 5
): number {
  if (!candidates || candidates.length === 0) return 0;
  
  const minK = Math.min(k, candidates.length);
  let dcg = 0;
  
  for (let i = 0; i < minK; i++) {
    const candidateId = candidates[i].id;
    
    if (judgments[candidateId] === undefined) {
      throw new Error(`UNJUDGED: Candidate ${candidateId} is missing a judgment.`);
    }
    
    const rel = judgments[candidateId];
    const gain = Math.pow(2, rel) - 1;
    dcg += gain / Math.log2(i + 2); // i+2 is (position+1) + 1 because 0-indexed and log2(pos+1)
  }

  // Calculate IDCG (Ideal DCG)
  const allRelevances = candidates
    .filter(c => judgments[c.id] !== undefined)
    .map(c => judgments[c.id])
    .sort((a, b) => b - a); // Sort descending
    
  let idcg = 0;
  const idealK = Math.min(k, allRelevances.length);
  for (let i = 0; i < idealK; i++) {
    const rel = allRelevances[i];
    const gain = Math.pow(2, rel) - 1;
    idcg += gain / Math.log2(i + 2);
  }

  if (idcg === 0) return 0;
  
  return dcg / idcg;
}
