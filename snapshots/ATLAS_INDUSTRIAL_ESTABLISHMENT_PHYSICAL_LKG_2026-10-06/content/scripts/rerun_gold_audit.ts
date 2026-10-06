import fs from 'fs';

const data = JSON.parse(fs.readFileSync('C:/Users/Eduardo/.gemini/antigravity-ide/brain/6aacf1b1-9f5b-4af0-bc20-4636248c0f21/scratch/extracted_signals.json', 'utf8'));

// Refined Rules
const REFINED_RULES = [
    { type: 'EXPANSION', keywords: ['nuestra nueva sucursal', 'nuestra nueva planta', 'nuestro nuevo centro', 'inauguramos nuestra', 'abrimos nuestra nueva', 'nuestra nueva fábrica'] },
    { type: 'REQUEST_FOR_VENDOR', keywords: ['buscamos proveedores para', 'licitación pública proveedores', 'convocatoria proveedores'] },
    { type: 'DISTRIBUTOR_SEARCH', keywords: ['buscamos distribuidores exclusivos', 'conviértete en nuestro distribuidor', 'buscamos distribuidor oficial'] },
    { type: 'NEW_PROJECT', keywords: ['nuestro nuevo proyecto inmobiliario', 'nuestro nuevo proyecto comercial'] },
    { type: 'NEW_SERVICE', keywords: ['lanzamos nuestro nuevo servicio', 'nuevo servicio para nuestros clientes'] }
];

const NEGATIVE_KEYWORDS = [
    'cómo', 'cuánto', 'tips', 'consejos', 'lecciones', 'razones', 'hace un año', 'noticias', 'podcast', 'entrevista'
];

let truePositives = 0;
let totalKept = 0;

for (const signal of data) {
    const channel = signal.evidence[0].content.profile.handle.toLowerCase();
    const text = signal.evidence[0].content.text_excerpt.toLowerCase();
    
    // Check if channel is news/government
    const isNews = channel.includes('press') || channel.includes('tv') || channel.includes('vision') || channel.includes('gobierno') || channel.includes('municipalidad') || channel.includes('eltrece') || channel.includes('expansión');
    
    if (isNews) continue; // Skip known news channels

    // Check negative keywords
    const hasNegative = NEGATIVE_KEYWORDS.some(k => text.includes(k));
    if (hasNegative) continue;

    // Evaluate refined rules
    let match = false;
    for (const rule of REFINED_RULES) {
        if (rule.keywords.some(k => text.includes(k))) {
            match = true;
            break;
        }
    }
    
    // Fallback: If it uses the exact 'abrimos nueva sucursal' but not 'nuestra', let's check
    if (!match && (text.includes('abrimos nueva sucursal') || text.includes('buscamos distribuidor') || text.includes('inauguramos la nueva planta'))) {
        match = true;
    }

    if (match) {
        totalKept++;
        console.log(`[KEPT] ${signal.evidence[0].content.profile.handle} - ${signal.evidence[0].content.text_excerpt.substring(0, 80)}`);
    }
}

console.log(`\nSignals kept: ${totalKept}`);
