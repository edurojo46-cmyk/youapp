import type { StructuredPersonQuery } from '../ai/gemini/GeminiSchemas';
import { supabase } from '../supabase';

const COMMON_PROFESSIONS = ['camionero', 'abogado', 'psicologo', 'psicólogo', 'medico', 'médico', 'empresario'];
const TEACHER_ALIASES = ['maestro', 'maestra', 'maestros', 'maestras', 'docente', 'docentes', 'profesor', 'profesora', 'profesores', 'profesoras'];
const CABA_ALIASES = ['caba', 'capital federal', 'ciudad autónoma de buenos aires', 'ciudad de buenos aires'];
const COMMON_LOCATIONS = ['palermo', 'buenos aires', 'cordoba', 'mendoza'];

export class SmartPersonQueryRouter {
  
  /**
   * Evaluates the raw query deterministically.
   * If confidence is HIGH, returns StructuredPersonQuery without calling Gemini.
   * If AMBIGUOUS, returns null, meaning Gemini must be invoked.
   */
  public static async evaluate(query: string): Promise<StructuredPersonQuery | null> {
    const lower = query.toLowerCase().trim();
    
    let profession: string | null = null;
    let location: string | null = null;
    let personCategory: any = null;
    let confidence = 0;
    
    // Check CABA explicitly first (multi-word match)
    for (const alias of CABA_ALIASES) {
       if (lower.includes(alias)) {
          location = 'CABA';
          confidence += 0.5;
          break; // found location
       }
    }

    // Check multi-word worker aliases
    if (lower.includes('empleado') || lower.includes('funcionario público') || lower.includes('empleados') || lower.includes('funcionarios')) {
       personCategory = 'WORKER';
       confidence += 0.5;
    }
    
    const words = lower.replace(/[.,]/g, '').split(/\s+/);
    
    for (const word of words) {
      if (COMMON_PROFESSIONS.includes(word)) {
         profession = word;
         confidence += 0.5;
      }
      if (TEACHER_ALIASES.includes(word)) {
         personCategory = 'TEACHER';
         // We also pass the profession to match normalized_profession_id
         profession = 'DOCENTE'; 
         confidence += 0.5;
      }
      // Single word locations (only if location not already found via multi-word)
      if (!location && COMMON_LOCATIONS.includes(word)) {
        location = word;
        confidence += 0.5;
      }
    }
    
    // High confidence threshold
    if (confidence >= 0.5) {
       return {
         intent: 'PERSON_SEARCH',
         personName: null,
         profession,
         personCategory,
         employmentStatus: null,
         organization: null,
         location: location ? { country: 'Argentina', jurisdiction: location, neighborhood: null } : null,
         confidence: 0.9,
         ambiguities: []
       };
    }
    
    // Ambiguous
    return null;
  }
  
  /**
   * Calls the Edge Function to invoke Gemini Query Interpreter
   */
  public static async interpretWithGemini(query: string): Promise<StructuredPersonQuery> {
     const { data, error } = await supabase.functions.invoke('atlas-gemini-person-search', {
        body: { action: 'INTERPRET_QUERY', query }
     });
     
     if (error || !data) {
       console.error("Gemini interpretation failed:", error);
       // Fallback to basic
       return {
         intent: 'UNKNOWN',
         personName: null,
         profession: null,
         personCategory: null,
         employmentStatus: null,
         organization: null,
         location: null,
         confidence: 0,
         ambiguities: ['Gemini API failed']
       };
     }
     
     return data.data as StructuredPersonQuery;
  }

  /**
   * Unified Query Intent Resolver for Atlas Knowledge Universe
   * Extends deterministic and semantic evaluation into a standardized QueryIntent.
   */
  public static resolveQueryIntent(rawQuery: string): any {
    const lower = rawQuery.toLowerCase().trim();

    // 1. Person Name Detection
    let personName: string | null = null;
    if (/pahlen/i.test(lower)) personName = 'Ricardo Pahlen Acuña';
    else if (/oro/i.test(lower)) personName = 'Juan Manuel Oro';
    else if (/pugliese/i.test(lower)) personName = 'Osvaldo Pugliese';
    else if (/gardel/i.test(lower)) personName = 'Carlos Gardel';
    else if (/maradona/i.test(lower)) personName = 'Diego Armando Maradona';
    else if (/messi/i.test(lower)) personName = 'Lionel Messi';
    else if (/borges/i.test(lower)) personName = 'Jorge Luis Borges';
    else if (/favaloro/i.test(lower)) personName = 'René Favaloro';

    // 2. Profession / Role Detection
    let profession: string | null = null;
    if (lower.includes('cardiólogo') || lower.includes('cardiologo')) profession = 'CARDIOLOGO';
    else if (lower.includes('médico') || lower.includes('medico') || lower.includes('doctor')) profession = 'MEDICO';
    else if (lower.includes('escribano')) profession = 'ESCRIBANO';
    else if (lower.includes('corredor') || lower.includes('inmobiliario')) profession = 'CORREDOR_INMOBILIARIO';
    else if (lower.includes('decano')) profession = 'DECANO';
    else if (lower.includes('abogado')) profession = 'ABOGADO';
    else if (lower.includes('programador') || lower.includes('developer') || lower.includes('software')) profession = 'PROGRAMADOR';
    else if (lower.includes('psicólogo') || lower.includes('psicologo')) profession = 'PSICOLOGO';
    else if (lower.includes('docente') || lower.includes('profesor') || lower.includes('maestro')) profession = 'DOCENTE';
    else if (lower.includes('contador')) profession = 'CONTADOR';
    else if (lower.includes('investigador') || lower.includes('científico') || lower.includes('cientifico')) profession = 'INVESTIGADOR';

    // 3. Organization Detection
    let organization: string | null = null;
    if (lower.includes('uba') || lower.includes('universidad de buenos aires') || lower.includes('económicas')) {
      organization = 'Universidad de Buenos Aires (UBA)';
    } else if (lower.includes('conicet')) {
      organization = 'CONICET';
    } else if (lower.includes('hospital italiano')) {
      organization = 'Hospital Italiano de Buenos Aires';
    } else if (lower.includes('hospital durand')) {
      organization = 'Hospital Durand';
    } else if (lower.includes('cucicba')) {
      organization = 'CUCICBA';
    } else if (lower.includes('cpacf')) {
      organization = 'CPACF';
    }

    // 4. Geography Detection
    let geography = 'CABA';
    let neighborhood: string | null = null;
    if (lower.includes('mar del plata')) {
      geography = 'MAR DEL PLATA';
    } else if (lower.includes('la plata')) {
      geography = 'LA PLATA';
    } else if (lower.includes('córdoba') || lower.includes('cordoba')) {
      geography = 'CORDOBA';
    } else if (lower.includes('rosario')) {
      geography = 'ROSARIO';
    } else if (lower.includes('mendoza')) {
      geography = 'MENDOZA';
    } else if (lower.includes('salta')) {
      geography = 'SALTA';
    } else if (lower.includes('tucumán') || lower.includes('tucuman')) {
      geography = 'TUCUMAN';
    } else if (lower.includes('neuquén') || lower.includes('neuquen')) {
      geography = 'NEUQUEN';
    } else if (lower.includes('bariloche')) {
      geography = 'BARILOCHE';
    } else if (lower.includes('bahía blanca') || lower.includes('bahia blanca')) {
      geography = 'BAHIA BLANCA';
    } else if (lower.includes('caballito')) {
      neighborhood = 'Caballito';
      geography = 'CABA';
    } else if (lower.includes('palermo')) {
      neighborhood = 'Palermo';
      geography = 'CABA';
    } else if (lower.includes('recoleta')) {
      neighborhood = 'Recoleta';
      geography = 'CABA';
    } else if (lower.includes('belgrano')) {
      neighborhood = 'Belgrano';
      geography = 'CABA';
    }

    // 5. Activity
    let activity = 'GENERAL';
    if (profession === 'CARDIOLOGO' || profession === 'MEDICO' || profession === 'PSICOLOGO') activity = 'HEALTH';
    else if (profession === 'PROGRAMADOR') activity = 'SOFTWARE_DEVELOPMENT';
    else if (profession === 'DOCENTE' || profession === 'INVESTIGADOR' || profession === 'DECANO') activity = 'RESEARCH';
    else if (profession === 'ABOGADO' || profession === 'ESCRIBANO') activity = 'LEGAL';

    return {
      raw_query: rawQuery,
      person_name: personName,
      profession,
      organization,
      geography,
      neighborhood,
      activity
    };
  }
}
