import 'dotenv/config';
import { AtlasGeographyResolver } from '../src/lib/search/geography/AtlasGeographyResolver';

async function runResolutionTest() {
    console.log("=== ATLAS GEOGRAPHY RESOLUTION TEST ===");
    
    const resolver = new AtlasGeographyResolver();
    
    const queries = [
        "Argentina",
        "CABA",
        "Ciudad Autónoma de Buenos Aires",
        "Provincia de Buenos Aires",
        "La Plata",
        "Córdoba",
        "Córdoba, Córdoba",
        "Rosario",
        "Rosario, Santa Fe",
        "Santa Fe",
        "Mendoza"
    ];
    
    for (const q of queries) {
        console.log(`\nResolving: "${q}"`);
        const result = await resolver.resolve(q);
        
        console.log(`  Status: ${result.status}`);
        console.log(`  Candidates: ${result.candidates.length}`);
        if (result.status === 'VERIFIED') {
            console.log(`  SELECTED_ID: ${result.geography_id}`);
            console.log(`  TYPE: ${result.geography_type}`);
        } else if (result.status === 'AMBIGUOUS') {
            console.log(`  Top Candidates:`);
            result.candidates.slice(0, 3).forEach(c => console.log(`    - [${c.type}] ${c.name} (Score: ${c.confidence})`));
        }
        console.log(`  MATCH_METHOD: ${result.match_method}`);
    }
}

runResolutionTest().catch(console.error);
