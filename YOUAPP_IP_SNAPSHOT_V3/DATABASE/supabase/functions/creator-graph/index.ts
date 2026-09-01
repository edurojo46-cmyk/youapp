import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ═══════════════════════════════════════════════════════════════════════════
// creator-graph — Fase 10: Creator Graph V1
//
// YouApp deja de conocer "cuentas". Empieza a conocer personas, medios
// y creadores a través de todas sus plataformas.
//
// Acciones:
//   resolve   — Buscar o crear una creator_entity por nombre/handle
//   link      — Vincular una cuenta de plataforma a una creator_entity
//   sync      — Sincronizar cuentas conectadas (YouTube + Twitch en V1)
//   get       — Obtener un creador con todas sus cuentas
//   search    — Buscar creadores en creator_entities
// ═══════════════════════════════════════════════════════════════════════════

// ── Resolver canal de YouTube para Creator Graph ─────────────────────────────
async function resolveYouTubeChannel(
  handle: string,
  apiKey: string
): Promise<{ id: string; name: string; description: string; thumbnail: string; videoCount: number } | null> {
  // Intentar por handle
  const cleanHandle = handle.replace('@', '');
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&forHandle=${cleanHandle}&key=${apiKey}`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const ch = data.items?.[0];
  if (!ch) return null;
  return {
    id: ch.id,
    name: ch.snippet.title,
    description: ch.snippet.description,
    thumbnail: ch.snippet.thumbnails?.high?.url,
    videoCount: parseInt(ch.statistics?.videoCount || '0', 10)
  };
}

// ── Resolver canal de Twitch ──────────────────────────────────────────────────
async function resolveTwitchChannel(
  login: string,
  clientId: string,
  secret: string
): Promise<{ id: string; name: string; description: string; thumbnail: string } | null> {
  const tokenRes = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${secret}&grant_type=client_credentials`,
    { method: 'POST', signal: AbortSignal.timeout(8000) }
  );
  if (!tokenRes.ok) return null;
  const tokenData = await tokenRes.json();

  const res = await fetch(
    `https://api.twitch.tv/helix/users?login=${login}`,
    {
      headers: {
        'Client-Id': clientId,
        'Authorization': `Bearer ${tokenData.access_token}`
      },
      signal: AbortSignal.timeout(8000)
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const user = data.data?.[0];
  if (!user) return null;
  return {
    id: user.id,
    name: user.display_name,
    description: user.description,
    thumbnail: user.profile_image_url
  };
}

export default {
  fetch: async (req: Request) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    try {
      const body = await req.json();
      const { action } = body;

      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // ── 1. RESOLVE — Buscar o crear creator_entity ────────────────────────
      if (action === 'resolve') {
        const { name, provider, handle, description, category, country, language } = body;

        if (!name) return new Response(JSON.stringify({ error: 'name required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

        // Buscar si ya existe (por nombre exacto o similar)
        const { data: existing } = await supabase
          .from('creator_entities')
          .select('*, creator_accounts(*)')
          .ilike('canonical_name', name.trim())
          .maybeSingle();

        if (existing) {
          return new Response(JSON.stringify({ success: true, entity: existing, created: false }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Crear nueva entidad
        const { data: newEntity, error } = await supabase
          .from('creator_entities')
          .insert({
            canonical_name: name.trim(),
            description: description || null,
            category: category || null,
            country: country || null,
            language: language || null,
            entity_type: 'person'
          })
          .select()
          .single();

        if (error) throw new Error(error.message);

        // Si se provee handle + provider, vincular automáticamente
        if (handle && provider) {
          await supabase.from('creator_accounts').insert({
            creator_entity_id: newEntity.id,
            provider,
            handle,
            connected: false,
            authorized: false
          });
        }

        return new Response(JSON.stringify({ success: true, entity: newEntity, created: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ── 2. LINK — Vincular cuenta a creator_entity existente ─────────────
      if (action === 'link') {
        const { entity_id, provider, handle, provider_creator_id, canonical_url } = body;

        if (!entity_id || !provider) return new Response(JSON.stringify({
          error: 'entity_id and provider required'
        }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        const { error } = await supabase.from('creator_accounts').upsert({
          creator_entity_id: entity_id,
          provider,
          handle,
          provider_creator_id,
          canonical_url,
          connected: false,
          authorized: false
        }, { onConflict: 'provider,provider_creator_id' });

        if (error) throw new Error(error.message);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ── 3. SYNC — Sincronizar metadatos de cuentas conocidas ─────────────
      // En V1: solo YouTube y Twitch (tienen APIs de lookup por handle)
      if (action === 'sync') {
        const { entity_id } = body;
        const youtubeKey = Deno.env.get('YOUTUBE_API_KEY') || '';
        const twitchClientId = Deno.env.get('TWITCH_CLIENT_ID') || '';
        const twitchSecret = Deno.env.get('TWITCH_CLIENT_SECRET') || '';

        const { data: accounts } = await supabase
          .from('creator_accounts')
          .select('*')
          .eq('creator_entity_id', entity_id)
          .in('provider', ['youtube', 'twitch']);

        if (!accounts?.length) {
          return new Response(JSON.stringify({ success: true, synced: 0 }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        let synced = 0;
        for (const account of accounts) {
          try {
            if (account.provider === 'youtube' && youtubeKey && account.handle) {
              const ch = await resolveYouTubeChannel(account.handle, youtubeKey);
              if (ch) {
                await supabase.from('creator_accounts').update({
                  provider_creator_id: ch.id,
                  display_name: ch.name,
                  canonical_url: `https://www.youtube.com/@${account.handle}`,
                  video_count: ch.videoCount,
                  last_synced_at: new Date().toISOString(),
                  connected: true
                }).eq('id', account.id);
                synced++;
              }
            }
            if (account.provider === 'twitch' && twitchClientId && account.handle) {
              const ch = await resolveTwitchChannel(account.handle, twitchClientId, twitchSecret);
              if (ch) {
                await supabase.from('creator_accounts').update({
                  provider_creator_id: ch.id,
                  display_name: ch.name,
                  canonical_url: `https://www.twitch.tv/${account.handle}`,
                  last_synced_at: new Date().toISOString(),
                  connected: true
                }).eq('id', account.id);
                synced++;
              }
            }
          } catch { /* best-effort per account */ }
        }

        return new Response(JSON.stringify({ success: true, synced }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ── 4. GET — Obtener creador con todas sus cuentas ────────────────────
      if (action === 'get') {
        const { entity_id, canonical_name } = body;

        let query = supabase
          .from('creator_entities')
          .select('*, creator_accounts(*)');

        if (entity_id) query = query.eq('id', entity_id);
        else if (canonical_name) query = query.ilike('canonical_name', canonical_name);
        else return new Response(JSON.stringify({ error: 'entity_id or canonical_name required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

        const { data: entity } = await query.maybeSingle();
        return new Response(JSON.stringify({ success: true, entity }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // ── 5. SEARCH — Buscar creadores ──────────────────────────────────────
      if (action === 'search') {
        const { q, category, limit = 20 } = body;

        let query = supabase
          .from('creator_entities')
          .select('*, creator_accounts(provider, handle, canonical_url, connected)')
          .limit(limit);

        if (q) query = query.ilike('canonical_name', `%${q}%`);
        if (category) query = query.eq('category', category);

        const { data: entities } = await query;
        return new Response(JSON.stringify({ success: true, entities: entities || [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
