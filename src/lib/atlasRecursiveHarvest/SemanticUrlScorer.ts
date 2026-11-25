/**
 * ATLAS — SEMANTIC URL SCORER
 * Ranks reachable URLs within an ecosystem by probability of yielding professional / institutional contacts
 */

export class SemanticUrlScorer {
  // High-value contact & structural keywords
  private static HIGH_VALUE_PATTERNS = [
    /contacto|contact/i,
    /autoridades|autoridad/i,
    /directorio/i,
    /personal|staff/i,
    /docentes|docente/i,
    /investigadores|investigador/i,
    /departamentos|departamento/i,
    /institutos|instituto/i,
    /secretarias|secretaria/i,
    /catedras|catedra/i,
    /facultades|facultad/i,
    /sedes|sede/i,
    /claustro/i,
    /matriculados|matricula/i,
    /padron/i,
    /guia(?:-tramites)?/i,
    /organigrama/i,
    /dependencias/i,
    /gestion/i,
    /decanato/i,
    /rectorado/i,
    /administracion/i
  ];

  // Secondary structural keywords
  private static MEDIUM_VALUE_PATTERNS = [
    /institucional/i,
    /academica|academico/i,
    /carreras|carrera/i,
    /posgrado/i,
    /investigacion/i,
    /extension/i,
    /graduados/i,
    /ensenanza/i,
    /bienestar/i,
    /comunicacion/i,
    /transparencia/i
  ];

  // Low value or noise patterns to heavily penalize
  private static JUNK_PATTERNS = [
    /\.(jpg|jpeg|png|gif|webp|svg|ico|css|js|woff|woff2|ttf|eot|mp4|mp3|avi|zip|tar|gz|rar|exe)$/i,
    /\/wp-content\/uploads\//i,
    /\/tag\/|\/tags\//i,
    /\/category\/|\/categorias\//i,
    /\/page\/\d+/i,
    /\/feed\/?$/i,
    /\/comments\/?/i,
    /\/login|\/signin|\/logout|\/register/i,
    /\/cart|\/checkout|\/tienda/i,
    /share=|facebook\.com|twitter\.com|instagram\.com|linkedin\.com/i,
    /#/
  ];

  /**
   * Scores a candidate URL from 0 to 100
   */
  public static scoreUrl(url: string, depth: number = 0): number {
    // Immediate disqualification for noise
    for (const junk of this.JUNK_PATTERNS) {
      if (junk.test(url)) return -1;
    }

    let score = 50 - (depth * 10); // Base score diminishes with crawling depth

    // Boost high-value keywords
    for (const pattern of this.HIGH_VALUE_PATTERNS) {
      if (pattern.test(url)) {
        score += 35;
        break;
      }
    }

    // Boost medium-value keywords
    for (const pattern of this.MEDIUM_VALUE_PATTERNS) {
      if (pattern.test(url)) {
        score += 15;
        break;
      }
    }

    // Penalize overly deep path structures
    const pathSegments = new URL(url).pathname.split('/').filter(Boolean);
    if (pathSegments.length > 5) {
      score -= (pathSegments.length - 5) * 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Determines if a target URL belongs to the allowed scope of an ecosystem
   */
  public static isWithinEcosystemScope(targetUrl: string, baseDomain: string): boolean {
    try {
      const targetHost = new URL(targetUrl).hostname.toLowerCase();
      const baseHost = baseDomain.toLowerCase();

      // Exact match
      if (targetHost === baseHost) return true;

      // Subdomain match (e.g. internacionales.exactas.uba.ar vs exactas.uba.ar)
      if (targetHost.endsWith(`.${baseHost}`)) return true;

      // Sibling faculty/department match within same parent domain
      const baseParts = baseHost.split('.');
      if (baseParts.length >= 3) {
        const rootDomain = baseParts.slice(-3).join('.'); // e.g. uba.ar or mdp.edu.ar
        if (targetHost.endsWith(rootDomain)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }
}
