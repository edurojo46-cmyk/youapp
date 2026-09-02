import { supabase } from '../supabase';
import type { UniversalContent, UniversalLibraryItem } from './streamingTypes';
import {
  FIXTURE_HERO_INTERSTELLAR,
  FIXTURE_RECOMMENDED_TITLES,
  FIXTURE_CONTINUE_WATCHING,
  FIXTURE_DISCOVERY_CATALOG
} from './streamingFixtures';

/**
 * Control estricto de fixtures:
 * En desarrollo o si está explícitamente habilitado por flag, se permiten fixtures.
 * En producción (sin flag), NUNCA se inyectan fixtures ficticios.
 */
const allowStreamingFixtures = import.meta.env.VITE_ALLOW_STREAMING_FIXTURES === 'true' || import.meta.env.DEV;

export class StreamingRepository {
  /**
   * Obtener título destacado para el Hero
   */
  async getFeaturedTitle(): Promise<UniversalContent | null> {
    try {
      const { data, error } = await supabase
        .from('streaming_titles')
        .select(`
          *,
          availability:streaming_availability(*)
        `)
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return this.mapDbToUniversalContent(data);
      }
    } catch {
      // ignore
    }

    return allowStreamingFixtures ? FIXTURE_HERO_INTERSTELLAR : null;
  }

  /**
   * Obtener títulos recomendados
   */
  async getRecommendedTitles(userPlatforms: string[] = []): Promise<UniversalContent[]> {
    try {
      const { data, error } = await supabase
        .from('streaming_titles')
        .select(`
          *,
          availability:streaming_availability(*)
        `)
        .limit(12);

      if (!error && data && data.length > 0) {
        return data.map((d: any) => this.mapDbToUniversalContent(d));
      }
    } catch {
      // ignore
    }

    return allowStreamingFixtures ? FIXTURE_RECOMMENDED_TITLES : [];
  }

  /**
   * Obtener títulos de "Continuar viendo" / actividad reciente
   */
  async getContinueWatching(userId?: string): Promise<UniversalContent[]> {
    if (userId) {
      try {
        const { data, error } = await supabase
          .from('user_streaming_activity')
          .select('*')
          .eq('user_id', userId)
          .order('last_opened_at', { ascending: false })
          .limit(8);

        if (!error && data && data.length > 0) {
          return data.map((act: any) => ({
            id: act.content_id,
            type: act.content_type || 'movie',
            title: act.content_title,
            currentSeasonEpisode: act.episode_text,
            durationText: act.episode_text || 'Abriste recientemente',
            genres: [],
            posterUrl: act.poster_url || '',
            primaryProvider: act.provider_code,
            playbackMode: act.progress_sec ? 'youapp_player' : 'external_provider',
            progressPercent: act.progress_sec && act.total_duration_sec 
              ? Math.round((act.progress_sec / act.total_duration_sec) * 100) 
              : undefined,
            progressSec: act.progress_sec,
            totalDurationSec: act.total_duration_sec,
            lastOpenedAt: act.last_opened_at,
            availability: [
              {
                provider: act.provider_code,
                providerName: act.provider_code.toUpperCase(),
                country: 'AR',
                access: 'subscription',
                verifiedAt: act.last_opened_at
              }
            ]
          }));
        }
      } catch {
        // ignore
      }
    }

    return allowStreamingFixtures ? FIXTURE_CONTINUE_WATCHING : [];
  }

  /**
   * Obtener detalle completo de un título por ID o Slug
   */
  async getContentDetail(id: string, type?: string): Promise<UniversalContent | null> {
    try {
      const { data, error } = await supabase
        .from('streaming_titles')
        .select(`
          *,
          availability:streaming_availability(*)
        `)
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        return this.mapDbToUniversalContent(data);
      }
    } catch {
      // ignore
    }

    if (allowStreamingFixtures) {
      return FIXTURE_DISCOVERY_CATALOG.find(c => c.id === id || c.externalIds?.tmdb?.toString() === id) || FIXTURE_HERO_INTERSTELLAR;
    }

    return null;
  }

  /**
   * Búsqueda en catálogo con filtrado por lenguaje natural y plataformas
   */
  async searchCatalog(params: {
    query?: string;
    providerFilter?: string;
    onlyMyPlatforms?: boolean;
    userPlatforms?: string[];
    genreFilter?: string;
  }): Promise<UniversalContent[]> {
    const { query, providerFilter, onlyMyPlatforms, userPlatforms, genreFilter } = params;

    let list: UniversalContent[] = [];

    try {
      const { data, error } = await supabase
        .from('streaming_titles')
        .select(`
          *,
          availability:streaming_availability(*)
        `)
        .limit(50);

      if (!error && data && data.length > 0) {
        list = data.map((d: any) => this.mapDbToUniversalContent(d));
      } else if (allowStreamingFixtures) {
        list = [...FIXTURE_DISCOVERY_CATALOG];
      }
    } catch {
      if (allowStreamingFixtures) {
        list = [...FIXTURE_DISCOVERY_CATALOG];
      }
    }

    // 1. Filtro "Solo las que ya pago" (Mis plataformas)
    if (onlyMyPlatforms && userPlatforms && userPlatforms.length > 0) {
      const set = new Set(userPlatforms);
      list = list.filter(item => item.availability.some(a => set.has(a.provider)));
    }

    // 2. Filtro por plataforma específica
    if (providerFilter && providerFilter !== 'all' && providerFilter !== 'my_platforms') {
      list = list.filter(item => item.availability.some(a => a.provider === providerFilter));
    }

    // 3. Filtro por género
    if (genreFilter && genreFilter !== 'all') {
      list = list.filter(item => 
        item.genres.some(g => g.toLowerCase().includes(genreFilter.toLowerCase()))
      );
    }

    // 4. Búsqueda por texto o intención en lenguaje natural
    if (query && query.trim()) {
      const q = query.toLowerCase().trim();

      if (q.includes('menos de') || q.includes('corta') || q.includes('rapida')) {
        list = list.filter(item => (item.durationMin || 120) <= 120);
      } else if (q.includes('divertid') || q.includes('comedia') || q.includes('cenar')) {
        list = list.filter(item => 
          item.genres.some(g => ['comedia', 'animación', 'familia', 'romance'].includes(g.toLowerCase()))
        );
      } else if (q.includes('pensar') || q.includes('inteligente') || q.includes('suspenso')) {
        list = list.filter(item => 
          item.genres.some(g => ['ciencia ficción', 'drama', 'misterio', 'crimen', 'historia'].includes(g.toLowerCase()))
        );
      } else {
        list = list.filter(item => (
          item.title.toLowerCase().includes(q) ||
          item.genres.some(g => g.toLowerCase().includes(q)) ||
          (item.director && item.director.toLowerCase().includes(q)) ||
          (item.cast && item.cast.some(c => c.toLowerCase().includes(q))) ||
          (item.description && item.description.toLowerCase().includes(q))
        ));
      }
    }

    return list;
  }

  // ── MÉTODOS DE PERSISTENCIA DE USUARIO ───────────────────────────────────────

  async fetchUserPlatforms(userId: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('user_streaming_services')
        .select('provider_code, enabled')
        .eq('user_id', userId);

      if (!error && data && data.length > 0) {
        return data.filter(s => s.enabled).map(s => s.provider_code);
      }
    } catch {
      // ignore
    }
    return ['netflix', 'prime_video', 'disney_plus'];
  }

  async saveUserPlatform(userId: string, providerCode: string, enabled: boolean): Promise<void> {
    try {
      await supabase
        .from('user_streaming_services')
        .upsert({
          user_id: userId,
          provider_code: providerCode,
          enabled,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,provider_code' });
    } catch (e) {
      console.warn('saveUserPlatform error:', e);
    }
  }

  async fetchUserLibrary(userId: string): Promise<UniversalContent[]> {
    try {
      const { data, error } = await supabase
        .from('user_library')
        .select('*')
        .eq('user_id', userId)
        .order('saved_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return data.map((lib: any) => ({
          id: lib.content_key,
          type: lib.content_type || 'movie',
          title: lib.title,
          posterUrl: lib.poster_url || '',
          genres: lib.metadata_snapshot?.genres || [],
          year: lib.metadata_snapshot?.year,
          primaryProvider: lib.provider || 'netflix',
          playbackMode: 'external_provider' as const,
          availability: []
        }));
      }
    } catch {
      // ignore
    }
    return [];
  }

  async saveToUserLibrary(userId: string, item: UniversalContent): Promise<void> {
    try {
      await supabase
        .from('user_library')
        .upsert({
          user_id: userId,
          content_type: item.type || 'movie',
          content_key: item.id,
          provider: item.primaryProvider || 'netflix',
          external_id: item.externalIds?.tmdb?.toString(),
          title: item.title,
          poster_url: item.posterUrl,
          metadata_snapshot: {
            year: item.year,
            genres: item.genres,
            director: item.director,
            matchScore: item.matchScore
          },
          saved_at: new Date().toISOString()
        }, { onConflict: 'user_id,content_key' });
    } catch (e) {
      console.warn('saveToUserLibrary error:', e);
    }
  }

  async removeFromUserLibrary(userId: string, contentKey: string): Promise<void> {
    try {
      await supabase
        .from('user_library')
        .delete()
        .eq('user_id', userId)
        .eq('content_key', contentKey);
    } catch (e) {
      console.warn('removeFromUserLibrary error:', e);
    }
  }

  async logUserActivity(userId: string, content: UniversalContent): Promise<void> {
    try {
      await supabase
        .from('user_streaming_activity')
        .upsert({
          user_id: userId,
          content_id: content.id,
          content_type: content.type || 'movie',
          content_title: content.title,
          poster_url: content.posterUrl,
          provider_code: content.primaryProvider,
          last_opened_at: new Date().toISOString()
        }, { onConflict: 'user_id,content_id' });
    } catch (e) {
      console.warn('logUserActivity error:', e);
    }
  }

  private mapDbToUniversalContent(row: any): UniversalContent {
    return {
      id: row.id,
      type: row.content_type || 'movie',
      title: row.title,
      originalTitle: row.original_title,
      description: row.description,
      year: row.year,
      durationMin: row.duration_min,
      durationText: row.duration_min ? `${Math.floor(row.duration_min / 60)}h ${row.duration_min % 60}m` : undefined,
      posterUrl: row.poster_url || '',
      backdropUrl: row.backdrop_url,
      genres: Array.isArray(row.genres) ? row.genres : [],
      director: row.director,
      cast: Array.isArray(row.cast_list) ? row.cast_list : [],
      rating: row.metadata?.rating || 8.0,
      matchScore: row.metadata?.matchScore || 90,
      primaryProvider: row.availability?.[0]?.provider_code || 'netflix',
      playbackMode: 'external_provider',
      availability: (row.availability || []).map((a: any) => ({
        provider: a.provider_code,
        providerName: a.provider_code.toUpperCase(),
        country: a.country_code || 'AR',
        access: a.access_type || 'subscription',
        accessLabel: a.access_type === 'subscription' ? 'Incluida con tu suscripción' : a.access_type,
        webUrl: a.web_url,
        deepLink: a.deep_link,
        price: a.price,
        currency: a.currency,
        quality: a.quality,
        source: a.source,
        sourceRecordId: a.source_record_id,
        verifiedAt: a.verified_at,
        isDemo: false
      }))
    };
  }
}

export const streamingRepository = new StreamingRepository();

export const FEATURED_HERO = FIXTURE_HERO_INTERSTELLAR;
export const RECOMMENDED_TITLES = FIXTURE_RECOMMENDED_TITLES;
export const CONTINUE_WATCHING_TITLES = FIXTURE_CONTINUE_WATCHING;
export const ALL_STREAMING_CATALOG = FIXTURE_DISCOVERY_CATALOG;
export function searchStreamingCatalog(query: string) {
  const q = query.toLowerCase();
  return ALL_STREAMING_CATALOG.filter(c => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
}
