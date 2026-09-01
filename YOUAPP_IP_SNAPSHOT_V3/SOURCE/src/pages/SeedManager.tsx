import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  Database, Plus, Check, X, RefreshCw, AlertCircle, Play, ListVideo, Link,
  FileText, Film, Loader2, ChevronDown, ChevronUp, Zap, Search,
  CheckCircle2, AlertTriangle, XCircle, Eye, ExternalLink
} from 'lucide-react';

// ── 150 canales pendientes de resolución automática ───────────────────────────
// Solo se necesita: nombre + handle (cuando se conoce) + tier
// El Seed Resolver completa: channelId, canonicalUrl, uploadsPlaylistId, thumbnail, country
type PendingChannel = {
  name: string;
  handle?: string;
  tier: 'A' | 'B' | 'C';
};

const PENDING_150: PendingChannel[] = [
  // ── Plataformas de streaming globales ─────────────────────────────────
  { name: 'Netflix',                          handle: '@netflix',             tier: 'A' },
  { name: 'Netflix España',                   handle: '@netflixes',           tier: 'A' },
  { name: 'Netflix Anime',                    handle: '@netflixanime',        tier: 'A' },
  { name: 'Prime Video',                      handle: '@primevideo',          tier: 'A' },
  { name: 'Prime Video España',               handle: '@primevideoes',        tier: 'A' },
  { name: 'Max',                              handle: '@max',                 tier: 'A' },
  { name: 'HBO',                              handle: '@hbo',                 tier: 'A' },
  { name: 'HBO Latinoamérica',                handle: '@hbomaxla',            tier: 'A' },
  { name: 'Paramount Plus Latinoamérica',     handle: '@paramountpluslat',    tier: 'A' },
  { name: 'Disney Plus',                      handle: '@disneyplus',          tier: 'A' },
  { name: 'Hulu',                             handle: '@hulu',                tier: 'A' },
  { name: 'Peacock',                          handle: '@peacocktv',           tier: 'A' },
  { name: 'Tubi',                             handle: '@tubi',                tier: 'B' },
  { name: 'Pluto TV',                         handle: '@plutotv',             tier: 'B' },
  { name: 'The Roku Channel',                 handle: '@therokuchannel',      tier: 'B' },
  { name: 'Shudder',                          handle: '@shudder',             tier: 'B' },
  { name: 'AMC Plus',                         handle: '@amcplus',             tier: 'B' },
  { name: 'STARZ',                            handle: '@starz',               tier: 'B' },
  { name: 'BritBox',                          handle: '@britbox',             tier: 'B' },
  { name: 'Acorn TV',                         handle: '@acorntv',             tier: 'B' },
  { name: 'Rakuten Viki',                     handle: '@vikirakutenviki',     tier: 'B' },
  { name: 'ViX',                              handle: '@vix',                 tier: 'A' },
  { name: 'ViX Español',                                                       tier: 'A' },
  // ── Studios internacionales ────────────────────────────────────────────
  { name: 'Warner Bros. Pictures Latinoamérica',                               tier: 'A' },
  { name: 'Universal Pictures Latinoamérica',                                  tier: 'A' },
  { name: 'Sony Pictures Latinoamérica',                                       tier: 'A' },
  { name: 'Walt Disney Studios',              handle: '@disneystudios',       tier: 'A' },
  { name: 'Lucasfilm',                        handle: '@lucasfilm',           tier: 'A' },
  { name: 'NEON',                             handle: '@neonrated',           tier: 'A' },
  { name: 'IFC Films',                        handle: '@ifcfilms',            tier: 'B' },
  { name: 'Magnolia Pictures',                handle: '@magnoliapictures',    tier: 'B' },
  { name: 'Sony Pictures Classics',                                            tier: 'B' },
  { name: 'MGM',                              handle: '@mgm',                 tier: 'A' },
  { name: 'Blumhouse',                        handle: '@blumhouse',           tier: 'A' },
  { name: 'Legendary',                        handle: '@legendary',           tier: 'A' },
  { name: 'STXfilms',                         handle: '@stxentertainment',    tier: 'B' },
  { name: 'Bleecker Street',                  handle: '@bleeckerstreetmedia', tier: 'B' },
  { name: 'Roadside Attractions',                                              tier: 'C' },
  { name: 'Vertical',                                                          tier: 'C' },
  { name: 'Saban Films',                                                       tier: 'C' },
  { name: 'FilmNation Entertainment',                                          tier: 'C' },
  { name: 'StudioCanal',                      handle: '@studiocanal',         tier: 'A' },
  { name: 'Pathé',                            handle: '@patheofficiel',       tier: 'A' },
  { name: 'Gaumont',                          handle: '@gaumont',             tier: 'B' },
  { name: 'Kino Lorber',                      handle: '@kinolorber',          tier: 'B' },
  { name: 'FilmRise',                         handle: '@filmrise',            tier: 'B' },
  { name: 'Film Movement',                                                     tier: 'C' },
  { name: 'Well Go USA Entertainment',        handle: '@wellgousaent',        tier: 'B' },
  { name: 'Aardman',                          handle: '@aardman',             tier: 'A' },
  { name: 'Annapurna Pictures',               handle: '@annapurnapictures',   tier: 'A' },
  { name: 'Curzon',                           handle: '@curzonfilm',          tier: 'B' },
  { name: 'Madman Films',                                                      tier: 'C' },
  { name: 'Umbrella Entertainment',                                            tier: 'C' },
  { name: 'XYZ Films',                                                         tier: 'C' },
  { name: 'Toho International',               handle: '@tohocinemas',         tier: 'A' },
  // ── Anime / Manga ────────────────────────────────────────────────────
  { name: 'VIZ Media',                        handle: '@vizmedia',            tier: 'A' },
  { name: 'TMS Entertainment',                handle: '@tms_entertainment',   tier: 'B' },
  { name: 'Kadokawa Anime',                                                    tier: 'B' },
  { name: 'Aniplex',                          handle: '@aniplex',             tier: 'A' },
  { name: 'MUSE Asia',                        handle: '@museasia',            tier: 'B' },
  { name: 'Ani-One Asia',                     handle: '@anicozyvn',          tier: 'B' },
  // ── K-Drama / K-Content ──────────────────────────────────────────────
  { name: 'KOCOWA TV',                        handle: '@kocowa',              tier: 'B' },
  { name: 'tvN D ENT',                        handle: '@tvndent',             tier: 'B' },
  { name: 'SBS Catch',                        handle: '@sbscatch',            tier: 'B' },
  { name: 'TVING',                            handle: '@tving',               tier: 'B' },
  { name: 'Studio Dragon',                                                     tier: 'A' },
  { name: 'Korean Film Archive',              handle: '@koreafilmarchive',    tier: 'B' },
  // ── Cine de autor / internacional ────────────────────────────────────
  { name: 'Mosfilm',                          handle: '@mosfilm_eng',         tier: 'B' },
  { name: 'BFI',                              handle: '@britishfilminstitute', tier: 'B' },
  { name: 'Cineteca Nacional México',         handle: '@cinematecamx',        tier: 'B' },
  // ── Cadenas de TV norteamericanas ────────────────────────────────────
  { name: 'AMC',                              handle: '@amc',                 tier: 'A' },
  { name: 'FX Networks',                      handle: '@fxnetworks',          tier: 'A' },
  { name: 'Showtime',                         handle: '@showtime',            tier: 'A' },
  { name: 'CBS',                              handle: '@cbs',                 tier: 'A' },
  { name: 'NBC',                              handle: '@nbc',                 tier: 'A' },
  { name: 'ABC',                              handle: '@abcnetwork',          tier: 'A' },
  { name: 'FOX',                              handle: '@fox',                 tier: 'A' },
  { name: 'The CW',                           handle: '@cwseed',              tier: 'B' },
  // ── Cadenas de TV europeas ────────────────────────────────────────────
  { name: 'BBC',                              handle: '@bbc',                 tier: 'A' },
  { name: 'ITV',                              handle: '@itvofficial',         tier: 'A' },
  { name: 'Channel 4',                        handle: '@channel4',            tier: 'A' },
  { name: 'Sky TV',                           handle: '@sky',                 tier: 'A' },
  // ── Canales de cable USA ───────────────────────────────────────────────
  { name: 'TNT',                              handle: '@tnt',                 tier: 'B' },
  { name: 'TBS',                              handle: '@tbs',                 tier: 'B' },
  { name: 'Syfy',                             handle: '@syfy',                tier: 'B' },
  { name: 'USA Network',                      handle: '@usanetwork',          tier: 'B' },
  { name: 'Comedy Central',                   handle: '@comedycentral',       tier: 'B' },
  { name: 'Adult Swim',                       handle: '@adultswim',           tier: 'B' },
  { name: 'Cartoon Network',                  handle: '@cartoonnetwork',      tier: 'B' },
  { name: 'Nickelodeon',                      handle: '@nickelodeon',         tier: 'B' },
  { name: 'Discovery',                        handle: '@discovery',           tier: 'A' },
  { name: 'PBS',                              handle: '@pbs',                 tier: 'A' },
  { name: 'Hallmark Channel',                                                  tier: 'B' },
  { name: 'Lifetime',                         handle: '@lifetime',            tier: 'B' },
  { name: 'A&E',                              handle: '@aetv',                tier: 'B' },
  { name: 'Freeform',                         handle: '@freeform',            tier: 'B' },
  { name: 'MTV',                              handle: '@mtv',                 tier: 'B' },
  { name: 'BET',                              handle: '@bet',                 tier: 'B' },
  { name: 'SundanceTV',                                                        tier: 'C' },
  { name: 'IFC',                              handle: '@ifc',                 tier: 'C' },
  { name: 'BBC America',                      handle: '@bbcamerica',          tier: 'B' },
  // ── Latinoamérica ─────────────────────────────────────────────────────
  { name: 'AXN',                              handle: '@axn',                 tier: 'B' },
  { name: 'Sony Channel Latinoamérica',                                        tier: 'B' },
  { name: 'Sony Movies',                      handle: '@sonymovies',          tier: 'B' },
  { name: 'América TV',                       handle: '@americatv',           tier: 'A' },
  { name: 'elnueve',                                                           tier: 'A' },
  { name: 'TV Pública',                       handle: '@tvpublicaargentina',  tier: 'A' },
  { name: 'Canal Encuentro',                  handle: '@canalencuentro',      tier: 'A' },
  { name: 'Flow',                                                              tier: 'B' },
  // ── España ────────────────────────────────────────────────────────────
  { name: 'Antena 3',                         handle: '@antena3',             tier: 'A' },
  { name: 'laSexta',                          handle: '@lasexta',             tier: 'A' },
  { name: 'Atresplayer',                      handle: '@atresplayer',         tier: 'A' },
  { name: 'Filmin',                           handle: '@filmin',              tier: 'B' },
  { name: 'SkyShowtime España',                                                tier: 'B' },
  // ── México / LATAM ────────────────────────────────────────────────────
  { name: 'Las Estrellas',                    handle: '@lasestrellas',        tier: 'A' },
  { name: 'Telemundo',                        handle: '@telemundo',           tier: 'A' },
  { name: 'Univision',                        handle: '@univision',           tier: 'A' },
  { name: 'Caracol Televisión',               handle: '@caracoltv',           tier: 'A' },
  { name: 'RCN Televisión',                   handle: '@rcntv',               tier: 'A' },
  { name: 'Globoplay',                        handle: '@globoplay',           tier: 'A' },
  { name: 'Globo',                            handle: '@redeglob',            tier: 'A' },
  { name: 'Canal 13 Chile',                   handle: '@canal13chile',        tier: 'A' },
  // ── Series dobladas (canales de contenido en español/portugués) ───────
  { name: 'Casados con Hijos Argentina',                                       tier: 'B' },
  { name: 'Casados con Hijos Colombia',                                        tier: 'B' },
  { name: 'Casados Con Hijos México',                                          tier: 'B' },
  { name: 'S.W.A.T en Español',                                                tier: 'C' },
  { name: 'S.W.A.T em Português',                                              tier: 'C' },
  { name: 'The Good Doctor en Español',                                        tier: 'C' },
  { name: 'The Good Doctor em Português',                                      tier: 'C' },
  { name: 'The Blacklist em Português',                                        tier: 'C' },
  { name: 'The Blacklist en Español',                                          tier: 'C' },
  { name: 'Breaking Bad en Español',                                           tier: 'C' },
  { name: 'Breaking Bad em Português',                                         tier: 'C' },
  { name: 'Rosario Tijeras',                                                   tier: 'C' },
  { name: 'Doña Bárbara',                                                      tier: 'C' },
  { name: 'Zorro: La Espada y La Rosa',                                        tier: 'C' },
  { name: 'Sony Novelas',                                                      tier: 'B' },
  // ── Reality / entretenimiento ─────────────────────────────────────────
  { name: 'Shark Tank México',                handle: '@sharktan kmx',        tier: 'B' },
  { name: 'Shark Tank Latam',                                                  tier: 'B' },
  { name: 'Shark Tank Colombia',                                               tier: 'B' },
  { name: 'Escape Perfecto',                                                   tier: 'C' },
  { name: 'Shark Tank Brasil',                                                 tier: 'B' },
  { name: 'Aventura Gastronómica',                                             tier: 'C' },
  // ── Crítica / análisis de cine ────────────────────────────────────────
  { name: 'Fandango',                         handle: '@fandangomovies',      tier: 'B' },
  { name: 'The Take',                         handle: '@thetake',             tier: 'C' },
  { name: 'Now You See It',                   handle: '@nowyouseeit',         tier: 'C' },
  { name: 'SensaCine',                        handle: '@sensacine',           tier: 'B' },
  { name: 'Fuera de Foco',                    handle: '@fueradefoco',         tier: 'C' },
];

type ResolveStatus = 'pending' | 'resolving' | 'verified' | 'ambiguous' | 'not_found';

type ResolveResult = {
  name: string;
  handle?: string;
  tier: 'A' | 'B' | 'C';
  status: ResolveStatus;
  channelId?: string;
  canonicalUrl?: string;
  uploadsPlaylistId?: string;
  thumbnail?: string;
  country?: string;
  officialName?: string;
  candidates?: Array<{ channelId: string; name: string; thumbnail?: string; subscribers?: string }>;
  error?: string;
};


// ── 50 canales de Películas & Series contrastados con metadata pública ─────────
const MOVIES_SERIES_SEED: Array<{ name: string; provider_channel_id: string; tier: 'A' | 'B' | 'C' }> = [
  { name: 'Netflix Latinoamérica',          provider_channel_id: 'UC5ZiUaIJ2b5dYBYGf5iEUrA', tier: 'A' },
  { name: 'Disney+ Latinoamérica',          provider_channel_id: 'UC3uPK6zOTe0HOfcIkuzII0Q', tier: 'A' },
  { name: 'Prime Video Latinoamérica',      provider_channel_id: 'UCP7i-E6AYr-UChpNcO0EEag', tier: 'A' },
  { name: 'Paramount Pictures',             provider_channel_id: 'UCF9imwPMSGz4Vq1NiTWCC7g', tier: 'A' },
  { name: 'Lionsgate Movies',               provider_channel_id: 'UCJ6nMHaJPZvsJ-HmUmj1SeA', tier: 'A' },
  { name: 'A24',                            provider_channel_id: 'UCuPivVjnfNo4mb3Oog_frZg', tier: 'A' },
  { name: 'Focus Features',                 provider_channel_id: 'UCU4SM3j_9TNWaSu8KdGV50g', tier: 'A' },
  { name: 'Marvel Entertainment',           provider_channel_id: 'UCvC4D8onUfXzvjTOM-dBfEA', tier: 'A' },
  { name: '20th Century Studios',           provider_channel_id: 'UC2-BeLxzUBSs0uSrmzWhJuQ', tier: 'A' },
  { name: 'Universal Pictures',             provider_channel_id: 'UCq0OueAsdxH6b8nyAspwViw', tier: 'A' },
  { name: 'Illumination',                   provider_channel_id: 'UCq7OHvWO6Z3u-LztFdrcU-g', tier: 'A' },
  { name: 'Pixar',                          provider_channel_id: 'UC_IRYSp4auq7hKLvziWVH6w', tier: 'A' },
  { name: 'Sony Pictures Entertainment',    provider_channel_id: 'UCz97F7dMxBNOfGYu3rx8aCw', tier: 'A' },
  { name: 'Amazon MGM Studios',             provider_channel_id: 'UCf5CjDJvsFvtVIhkfmKAwAA', tier: 'A' },
  { name: 'KBS WORLD TV',                   provider_channel_id: 'UC5BMQOsAB8hKUyHu9KI6yig', tier: 'A' },
  { name: 'JTBC Drama',                     provider_channel_id: 'UCkbJc8jMcTXwhtmN5VMwfXg', tier: 'A' },
  { name: 'LAIKA Studios',                  provider_channel_id: 'UCBnyjFhOn23xjsqOUW4j6OQ', tier: 'A' },
  { name: 'GKIDS Films',                    provider_channel_id: 'UCb9ME2w6Y_4jChUVlWdltVg', tier: 'A' },
  { name: 'MBC DRAMA',                      provider_channel_id: 'UCBAEVMr0li9YYF8IwZHfusw', tier: 'A' },
  { name: 'Crunchyroll',                    provider_channel_id: 'UC6pGDc4bFGD1_36IKv3FnYg', tier: 'A' },
  { name: 'CJ ENM',                         provider_channel_id: 'UCA1TSDo1NXAGySZvqmX2A2Q', tier: 'A' },
  { name: 'CineFix',                        provider_channel_id: 'UCVtL1edhT8qqY-j2JIndMzg', tier: 'C' },
  { name: 'New Rockstars',                  provider_channel_id: 'UC7yRILFFJ2QZCykymr8LPwA', tier: 'C' },
  { name: 'ScreenCrush',                    provider_channel_id: 'UCgMJGv4cQl8-q71AyFeFmtg', tier: 'C' },
  { name: 'HISTORY',                        provider_channel_id: 'UC9MAhZQQd9egwWCxrwSIsJQ', tier: 'A' },
  { name: 'National Geographic',            provider_channel_id: 'UCpVm7bg6pXKo1Pr6k5kxG9A', tier: 'A' },
  { name: 'IMDb',                           provider_channel_id: 'UC_vz6SvmIkYs1_H3Wv2SKlg', tier: 'B' },
  { name: 'Rotten Tomatoes Trailers',       provider_channel_id: 'UCi8e0iOVk1fEOogdfu4YgfA', tier: 'B' },
  { name: 'Apple TV',                       provider_channel_id: 'UC1Myj674wRVXB9I4c6Hm5zA', tier: 'A' },
  { name: 'Paramount Plus',                 provider_channel_id: 'UCrRttZIypNTA1Mrfwo745Sg', tier: 'A' },
  { name: 'Movieclips',                     provider_channel_id: 'UC3gNmTGu-TTbFPpfSs5kNkg', tier: 'B' },
  { name: 'BBC Studios',                    provider_channel_id: 'UC2ccm1GajfSujz7T18d7cKA', tier: 'A' },
  { name: 'Thomas Flight',                  provider_channel_id: 'UCUyvQV2JsICeLZP4c_h40kA', tier: 'C' },
  { name: 'eltrece',                        provider_channel_id: 'UC0DM_mHV2u6dj8ig51GkQwg', tier: 'A' },
  { name: 'ZEPfilms',                       provider_channel_id: 'UC66soxYX4IBUF4V94EdyYBQ', tier: 'C' },
  { name: 'Movistar Plus+',                 provider_channel_id: 'UCEHD_P5browp_QPhPlbOIbQ', tier: 'A' },
  { name: 'Telefe',                         provider_channel_id: 'UCHc3el42hXKKhjs_1vzWk9A', tier: 'A' },
  { name: 'Te lo resumo',                   provider_channel_id: 'UCw7Bz6EHxlnOoBUBlJZCWCw', tier: 'C' },
  { name: 'FilmRise True Crime',            provider_channel_id: 'UCU4BHh9Dwfd7-I_xTZ5037Q', tier: 'B' },
  { name: 'RTVE Play',                      provider_channel_id: 'UCqlsTzBv49Uiu8Z3IseVgQQ', tier: 'A' },
  { name: 'RTVE Series',                    provider_channel_id: 'UCcJmo9dEwjkjOneRbmz7qfA', tier: 'A' },
  { name: 'Searchlight Pictures',           provider_channel_id: 'UCor9rW6PgxSQ9vUPWQdnaYQ', tier: 'A' },
  { name: 'Toei Animation',                 provider_channel_id: 'UCLhgIX2L5ZCaWdlaxR_oTAg', tier: 'A' },
  { name: 'MUBI',                           provider_channel_id: 'UCb6-VM5UQ4Czj_d3m9EPGfg', tier: 'A' },
  { name: 'DreamWorks Animation',           provider_channel_id: 'UCia2_wzvSZrQBzbopXT1Fcg', tier: 'A' },
  { name: 'Warner Bros. Pictures',          provider_channel_id: 'UCjmJDM5pRKbUlVIzDYYWb6g', tier: 'A' },
  { name: 'Lessons from the Screenplay',    provider_channel_id: 'UCErSSa3CaP_GJxmFpdjG9Jw', tier: 'C' },
  { name: 'MASTERPIECE PBS',               provider_channel_id: 'UC7jxQ3qqvy-1tQoJ3ZRv0Aw', tier: 'A' },
  { name: 'Shout! Studios / Shout! Factory',provider_channel_id: 'UCpHaAKu74UHvcYCi2g_PvBQ', tier: 'B' },
  { name: 'National Film Board of Canada',  provider_channel_id: 'UCeihXBww7ckKsKDF3JX13gA', tier: 'A' },
];

export default function SeedManager() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [showModal, setShowModal] = useState<'channel' | 'playlist' | 'csv' | 'url' | null>(null);
  const [inputUrl, setInputUrl] = useState('');
  const [inputCategory, setInputCategory] = useState('Historia');
  const [inputLimit, setInputLimit] = useState(50);
  
  const [previewData, setPreviewData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Manual Seed State ──
  const [manualName, setManualName] = useState('');
  const [manualHandle, setManualHandle] = useState('');
  const [manualChannelId, setManualChannelId] = useState('');
  const [manualTier, setManualTier] = useState<'A' | 'B' | 'C'>('B');
  const [manualLoading, setManualLoading] = useState(false);
  
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [jobItems, setJobItems] = useState<any[]>([]);

  // ── Bulk Seed State ──
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  const [selectedTiers, setSelectedTiers] = useState<Set<'A' | 'B' | 'C'>>(new Set(['A', 'B', 'C']));
  const [videosPerChannel, setVideosPerChannel] = useState(25);
  const [seedSources, setSeedSources] = useState<any[]>([]);

  // ── Resolver Panel State ──
  const [resolverResults, setResolverResults] = useState<ResolveResult[]>([]);
  const [resolverLoading, setResolverLoading] = useState(false);
  const [showResolverPanel, setShowResolverPanel] = useState(false);

  const handleResolve150 = async () => {
    setResolverLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('seed-resolver', {
        body: {
          action: 'resolve_batch',
          channels: PENDING_150,
          category: 'movies_series',
          limit: videosPerChannel
        }
      });
      if (error) throw error;
      if (data?.results) setResolverResults(data.results);
    } catch (e: any) {
      alert(`Error resolving: ${e.message}`);
    } finally {
      setResolverLoading(false);
      fetchSeedSources();
    }
  };

  const handleManualResolve = async () => {
    if (!manualName && !manualHandle && !manualChannelId) return;
    setManualLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('seed-resolver', {
        body: {
          action: 'resolve_batch',
          channels: [{
            name: manualName || manualHandle || manualChannelId,
            handle: manualHandle,
            provider_channel_id: manualChannelId,
            tier: manualTier
          }],
          category: 'movies_series',
          limit: videosPerChannel
        }
      });
      if (error) throw error;
      if (data?.results && data.results.length > 0) {
        alert(`Resuelto: ${data.results[0].status} (${data.results[0].resolutionMethod})`);
        setManualName(''); setManualHandle(''); setManualChannelId('');
      }
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setManualLoading(false);
      fetchSeedSources();
    }
  };

  const handleConfirmAmbiguous = async (channelName: string, candidateId: string, tier: string) => {
    try {
      const { error } = await supabase.functions.invoke('seed-resolver', {
        body: {
          action: 'confirm_ambiguous',
          name: channelName,
          channelId: candidateId,
          category: 'movies_series',
          tier
        }
      });
      if (error) throw error;

      // Actualizar el estado local para mostrarlo como verificado
      setResolverResults(prev => prev.map(r => 
        r.name === channelName ? { ...r, status: 'verified', channelId: candidateId } : r
      ));
      fetchSeedSources();
    } catch (e: any) {
      alert(`Error confirming: ${e.message}`);
    }
  };

  // ── 1. Cargar Jobs ──
  const fetchJobs = async () => {
    const { data, error } = await supabase
      .from('catalog_import_jobs')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) setJobs(data);
  };

  const fetchSeedSources = async () => {
    const { data } = await supabase
      .from('seed_sources')
      .select('provider_channel_id, name, status, tier')
      .eq('category', 'movies_series')
      .order('tier');
    if (data) setSeedSources(data);
  };

  useEffect(() => {
    fetchJobs();
    fetchSeedSources();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  // ── 2. Cargar Items de un Job ──
  const fetchItems = async (jobId: string) => {
    const { data } = await supabase
      .from('catalog_import_items')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });
    if (data) setJobItems(data);
  };

  useEffect(() => {
    if (selectedJob) fetchItems(selectedJob.id);
  }, [selectedJob]);

  // ── 3. Preview (Edge Function) ──
  const handlePreview = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase.functions.invoke('seed-import', {
        body: {
          action: 'preview',
          type: showModal,
          url: inputUrl,
        }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setPreviewData(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── 4. Start Import (Edge Function) ──
  const handleStartImport = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('seed-import', {
        body: {
          action: 'start',
          type: showModal,
          url: inputUrl,
          category: inputCategory,
          limit: inputLimit,
          uploadsPlaylistId: previewData?.uploadsPlaylistId
        }
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setShowModal(null);
      setPreviewData(null);
      setInputUrl('');
      fetchJobs();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── 5. Aprobar / Rechazar Item ──
  const handleApprove = async (itemId: string) => {
    await supabase.from('catalog_import_items').update({ status: 'approved' }).eq('id', itemId);
    fetchItems(selectedJob.id);
  };

  const handleReject = async (itemId: string) => {
    await supabase.from('catalog_import_items').update({ status: 'rejected' }).eq('id', itemId);
    fetchItems(selectedJob.id);
  };

  // ── 6. BULK SEED — Insertar 50 canales en seed_sources ──────────────────────
  const handleBulkSeed = async () => {
    setBulkLoading(true);
    setBulkResults(null);

    const toInsert = MOVIES_SERIES_SEED.filter(ch => selectedTiers.has(ch.tier));
    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const ch of toInsert) {
      try {
        const { error } = await supabase
          .from('seed_sources')
          .upsert(
            {
              name: ch.name,
              provider: 'youtube',
              provider_channel_id: ch.provider_channel_id,
              category: 'movies_series',
              tier: ch.tier,
              status: 'pending_verification',
              videos_per_channel: videosPerChannel,
            },
            {
              onConflict: 'provider_channel_id',
              ignoreDuplicates: true,
            }
          );

        if (error) {
          if (error.code === '23505') {
            skipped++;
          } else {
            errors.push(`${ch.name}: ${error.message}`);
          }
        } else {
          inserted++;
        }
      } catch (e: any) {
        errors.push(`${ch.name}: ${e.message}`);
      }
    }

    setBulkResults({ inserted, skipped, errors });
    setBulkLoading(false);
    fetchSeedSources();
  };

  // ── 7. Trigger Resolver en todos los pending ──────────────────────────────
  const handleTriggerResolver = async () => {
    setBulkLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('seed-resolver', {
        body: { category: 'movies_series', limit: videosPerChannel }
      });
      if (error) throw error;
      alert(`Resolver iniciado. Procesando ${data?.queued || '?'} canales pendientes.`);
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setBulkLoading(false);
      fetchSeedSources();
    }
  };

  const stats = {
    total: jobs.reduce((acc, j) => acc + (j.processed_count || 0), 0),
    approved: jobs.reduce((acc, j) => acc + (j.approved_count || 0), 0),
    duplicates: jobs.reduce((acc, j) => acc + (j.duplicate_count || 0), 0),
    rejected: jobs.reduce((acc, j) => acc + (j.rejected_count || 0), 0)
  };

  const seedStats = {
    total: MOVIES_SERIES_SEED.length,
    A: MOVIES_SERIES_SEED.filter(c => c.tier === 'A').length,
    B: MOVIES_SERIES_SEED.filter(c => c.tier === 'B').length,
    C: MOVIES_SERIES_SEED.filter(c => c.tier === 'C').length,
    inDB: seedSources.length,
    verified: seedSources.filter(s => s.status === 'verified').length,
    pending: seedSources.filter(s => s.status === 'pending_verification').length,
  };

  const tierColor = { A: '#10b981', B: '#3b82f6', C: '#f59e0b' };
  const tierBg   = { A: 'rgba(16,185,129,0.15)', B: 'rgba(59,130,246,0.15)', C: 'rgba(245,158,11,0.15)' };

  return (
    <div style={{ padding: '2rem', color: 'white', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: 0 }}>
            <Database className="text-neon-cyan" /> 
            Seed Manager <span style={{ fontSize: '0.8rem', background: 'var(--neon-purple)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>V2.5</span>
          </h1>
          <p style={{ opacity: 0.7, marginTop: '0.5rem' }}>Herramienta interna de ingestión de catálogo (Staging Area)</p>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════
          BULK SEED PANEL — Películas & Series (50 canales)
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: '2rem', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '16px', overflow: 'hidden' }}>
        
        {/* Header del panel */}
        <button
          onClick={() => setShowBulkPanel(!showBulkPanel)}
          style={{ width: '100%', background: 'rgba(16,185,129,0.08)', border: 'none', color: 'white', padding: '1.2rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Film size={20} color="#10b981" />
            <div style={{ textAlign: 'left' }}>
              <strong style={{ fontSize: '1rem' }}>Bulk Seed — Películas & Series</strong>
              <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.6 }}>
                50 canales pre-cargados · {seedStats.inDB} en DB · {seedStats.verified} verificados
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['A', 'B', 'C'] as const).map(t => (
                <span key={t} style={{ background: tierBg[t], color: tierColor[t], padding: '2px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700 }}>
                  Tier {t}: {seedStats[t]}
                </span>
              ))}
            </div>
            {showBulkPanel ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </button>

        {showBulkPanel && (
          <div style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.3)' }}>
            
            {/* Controles */}
            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-end', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              
              {/* Filtro de Tiers */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', opacity: 0.7, marginBottom: '8px' }}>FILTRAR POR TIER</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['A', 'B', 'C'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => {
                        const next = new Set(selectedTiers);
                        if (next.has(t)) { if (next.size > 1) next.delete(t); }
                        else next.add(t);
                        setSelectedTiers(next);
                      }}
                      style={{
                        background: selectedTiers.has(t) ? tierBg[t] : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${selectedTiers.has(t) ? tierColor[t] : 'rgba(255,255,255,0.1)'}`,
                        color: selectedTiers.has(t) ? tierColor[t] : '#6b7280',
                        padding: '6px 14px', borderRadius: '20px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem'
                      }}
                    >
                      Tier {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Videos por canal */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', opacity: 0.7, marginBottom: '8px' }}>VIDEOS / CANAL</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[10, 25, 50].map(n => (
                    <button
                      key={n}
                      onClick={() => setVideosPerChannel(n)}
                      style={{
                        background: videosPerChannel === n ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${videosPerChannel === n ? '#6366f1' : 'rgba(255,255,255,0.1)'}`,
                        color: videosPerChannel === n ? '#a5b4fc' : '#6b7280',
                        padding: '6px 14px', borderRadius: '20px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem'
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Estimación */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '8px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.6 }}>CANDIDATOS ESTIMADOS</p>
                <strong style={{ fontSize: '1.1rem', color: '#a5b4fc' }}>
                  {MOVIES_SERIES_SEED.filter(c => selectedTiers.has(c.tier)).length} × {videosPerChannel} = {' '}
                  {MOVIES_SERIES_SEED.filter(c => selectedTiers.has(c.tier)).length * videosPerChannel}
                </strong>
              </div>

              {/* Botones de acción */}
              <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
                <button
                  onClick={handleBulkSeed}
                  disabled={bulkLoading}
                  style={{ ...btnStyle, background: 'rgba(16,185,129,0.2)', border: '1px solid #10b981', color: '#10b981', padding: '10px 20px' }}
                >
                  {bulkLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={16} />}
                  Insertar en seed_sources
                </button>
                <button
                  onClick={handleTriggerResolver}
                  disabled={bulkLoading || seedStats.pending === 0}
                  style={{ ...btnStyle, background: 'rgba(59,130,246,0.2)', border: '1px solid #3b82f6', color: '#60a5fa', padding: '10px 20px' }}
                >
                  {bulkLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={16} />}
                  Resolver {seedStats.pending} pending
                </button>
              </div>
            </div>

            {/* Resultado del bulk insert */}
            {bulkResults && (
              <div style={{ background: 'rgba(0,0,0,0.4)', borderRadius: '10px', padding: '1rem', marginBottom: '1.5rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                  <span style={{ color: '#10b981' }}>✓ {bulkResults.inserted} insertados</span>
                  <span style={{ color: '#f59e0b' }}>⟳ {bulkResults.skipped} ya existían (omitidos)</span>
                  {bulkResults.errors.length > 0 && (
                    <span style={{ color: '#ef4444' }}>✗ {bulkResults.errors.length} errores</span>
                  )}
                </div>
                {bulkResults.errors.length > 0 && (
                  <ul style={{ margin: '8px 0 0', padding: '0 0 0 1rem', fontSize: '0.8rem', color: '#fca5a5' }}>
                    {bulkResults.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
            )}

            {/* Tabla de los 50 canales */}
            <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Canal</th>
                    <th style={thStyle}>provider_channel_id</th>
                    <th style={thStyle}>Tier</th>
                    <th style={thStyle}>Estado DB</th>
                  </tr>
                </thead>
                <tbody>
                  {MOVIES_SERIES_SEED.map((ch, idx) => {
                    const inDB = seedSources.find(s => s.provider_channel_id === ch.provider_channel_id);
                    const isSelected = selectedTiers.has(ch.tier);
                    return (
                      <tr
                        key={ch.provider_channel_id}
                        style={{
                          background: !isSelected ? 'rgba(0,0,0,0.2)' : idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)',
                          opacity: isSelected ? 1 : 0.35,
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          transition: 'opacity 0.2s'
                        }}
                      >
                        <td style={{ ...tdStyle, color: '#6b7280', width: '40px' }}>{idx + 1}</td>
                        <td style={tdStyle}><strong>{ch.name}</strong></td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#a5b4fc', fontSize: '0.78rem' }}>{ch.provider_channel_id}</td>
                        <td style={tdStyle}>
                          <span style={{ background: tierBg[ch.tier], color: tierColor[ch.tier], padding: '2px 10px', borderRadius: '20px', fontWeight: 700, fontSize: '0.75rem' }}>
                            {ch.tier}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          {inDB ? (
                            <span style={{
                              background: inDB.status === 'verified' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                              color: inDB.status === 'verified' ? '#10b981' : '#f59e0b',
                              padding: '2px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600
                            }}>
                              {inDB.status === 'verified' ? '✓ verified' : '⏳ pending'}
                            </span>
                          ) : (
                            <span style={{ color: '#4b5563', fontSize: '0.75rem' }}>— no importado</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p style={{ marginTop: '1rem', fontSize: '0.75rem', opacity: 0.4, textAlign: 'center' }}>
              provider = youtube · category = movies_series · status inicial = pending_verification · el Resolver completa canonical_url, uploads_playlist_id, thumbnail
            </p>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          RESOLVER PANEL — 150 CANALES
      ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: '2rem', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '16px', overflow: 'hidden' }}>
        
        {/* Header del panel */}
        <button
          onClick={() => setShowResolverPanel(!showResolverPanel)}
          style={{ width: '100%', background: 'rgba(139,92,246,0.08)', border: 'none', color: 'white', padding: '1.2rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Zap size={20} color="#8b5cf6" />
            <div style={{ textAlign: 'left' }}>
              <strong style={{ fontSize: '1rem' }}>Resolver Panel — 150 Canales (Nombres a IDs)</strong>
              <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.6 }}>
                Convierte automáticamente nombres y handles de canales en Channel IDs verificados
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd', padding: '2px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700 }}>
              {resolverResults.length > 0 ? `${resolverResults.filter(r => r.status === 'verified').length} / ${PENDING_150.length} Verificados` : `150 Pendientes`}
            </span>
            {showResolverPanel ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </button>

        {showResolverPanel && (
          <div style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.3)' }}>
            
            {/* MANUAL SEED INPUT */}
            <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h4 style={{ margin: '0 0 1rem 0', opacity: 0.8 }}>Agregar Canal Individual (Scout Fix)</h4>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', opacity: 0.7 }}>Nombre</label>
                  <input type="text" value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Ej: Te Lo Resumo" style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '6px' }} />
                </div>
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', opacity: 0.7 }}>Handle (@)</label>
                  <input type="text" value={manualHandle} onChange={e => setManualHandle(e.target.value)} placeholder="Ej: @teloresumo" style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '6px' }} />
                </div>
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', opacity: 0.7 }}>Channel ID (Opcional)</label>
                  <input type="text" value={manualChannelId} onChange={e => setManualChannelId(e.target.value)} placeholder="Ej: UC..." style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '6px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '4px', opacity: 0.7 }}>Tier</label>
                  <select value={manualTier} onChange={e => setManualTier(e.target.value as any)} style={{ padding: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '6px' }}>
                    <option value="A">A</option><option value="B">B</option><option value="C">C</option>
                  </select>
                </div>
                <button onClick={handleManualResolve} disabled={manualLoading} style={{ ...btnStyle, background: '#8b5cf6', color: 'white', border: 'none', padding: '8px 16px', height: '35px' }}>
                  {manualLoading ? 'Resolviendo...' : 'Resolver y Agregar'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <p style={{ margin: 0, opacity: 0.8, fontSize: '0.9rem', maxWidth: '600px', lineHeight: '1.5' }}>
                Este proceso usará el <strong>Seed Resolver</strong> para buscar cada canal en YouTube de forma automática, extraer su ID exacto y guardar el resultado verificado en la base de datos.
              </p>
              
              <button
                onClick={handleResolve150}
                disabled={resolverLoading}
                style={{ ...btnStyle, background: 'rgba(139,92,246,0.2)', border: '1px solid #8b5cf6', color: '#c4b5fd', padding: '12px 24px', fontSize: '1rem' }}
              >
                {resolverLoading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={18} />}
                {resolverResults.length > 0 ? 'Resolver Pendientes / Ambiguos' : 'Ejecutar Resolver (150 Canales)'}
              </button>
            </div>

            {/* Tabla de Resultados / Pendientes */}
            <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Canal</th>
                    <th style={thStyle}>Handle Original</th>
                    <th style={thStyle}>Tier</th>
                    <th style={thStyle}>Estado</th>
                    <th style={thStyle}>Acción (Ambiguos)</th>
                  </tr>
                </thead>
                <tbody>
                  {(resolverResults.length > 0 ? resolverResults : PENDING_150.map(p => ({ ...p, status: 'pending' as ResolveStatus }))).map((ch, idx) => {
                    return (
                      <tr
                        key={idx}
                        style={{
                          background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                        }}
                      >
                        <td style={{ ...tdStyle, color: '#6b7280', width: '40px' }}>{idx + 1}</td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {ch.thumbnail && <img src={ch.thumbnail} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />}
                            <strong>{ch.officialName || ch.name}</strong>
                          </div>
                          {ch.channelId && <div style={{ fontSize: '0.7rem', color: '#a5b4fc', fontFamily: 'monospace', marginTop: '4px' }}>{ch.channelId}</div>}
                        </td>
                        <td style={{ ...tdStyle, color: '#9ca3af' }}>{ch.handle || '—'}</td>
                        <td style={tdStyle}>
                          <span style={{ background: tierBg[ch.tier], color: tierColor[ch.tier], padding: '2px 10px', borderRadius: '20px', fontWeight: 700, fontSize: '0.75rem' }}>
                            {ch.tier}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          {ch.status === 'pending' && <span style={{ color: '#6b7280' }}>⏳ Pendiente</span>}
                          {ch.status === 'verified' && <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={14} /> Verificado</span>}
                          {ch.status === 'ambiguous' && <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={14} /> Ambiguo</span>}
                          {ch.status === 'not_found' && <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}><XCircle size={14} /> No encontrado</span>}
                        </td>
                        <td style={tdStyle}>
                          {ch.status === 'ambiguous' && ch.candidates && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {ch.candidates.map(cand => (
                                <div key={cand.channelId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', padding: '6px 10px', borderRadius: '6px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {cand.thumbnail && <img src={cand.thumbnail} alt="" style={{ width: 20, height: 20, borderRadius: '50%' }} />}
                                    <div>
                                      <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{cand.name}</div>
                                      <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{cand.subscribers || cand.channelId}</div>
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <a href={`https://youtube.com/channel/${cand.channelId}`} target="_blank" rel="noreferrer" style={{ padding: '4px', background: 'rgba(255,255,255,0.1)', color: 'white', borderRadius: '4px' }} title="Ver en YouTube"><ExternalLink size={14} /></a>
                                    <button onClick={() => handleConfirmAmbiguous(ch.name, cand.channelId, ch.tier)} style={{ padding: '4px 8px', background: 'rgba(16,185,129,0.2)', color: '#10b981', border: '1px solid #10b981', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>Confirmar</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>
        )}
      </div>

      {/* Acciones Rápidas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <button onClick={() => setShowModal('channel')} style={btnStyle}><Play size={18} /> + IMPORTAR CANAL</button>
        <button onClick={() => setShowModal('playlist')} style={btnStyle}><ListVideo size={18} /> + IMPORTAR LISTA</button>
        <button onClick={() => setShowModal('csv')} style={btnStyle}><FileText size={18} /> + IMPORTAR CSV</button>
        <button onClick={() => setShowModal('url')} style={btnStyle}><Link size={18} /> + AGREGAR URL</button>
      </div>

      {/* Métricas Globales */}
      <div style={{ display: 'flex', gap: '2rem', background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '12px', marginBottom: '2rem' }}>
        <div><h3 style={{ margin: 0, opacity: 0.7, fontSize: '0.9rem' }}>PROCESADOS</h3><strong style={{ fontSize: '1.5rem' }}>{stats.total}</strong></div>
        <div><h3 style={{ margin: 0, opacity: 0.7, fontSize: '0.9rem', color: '#10b981' }}>APROBADOS</h3><strong style={{ fontSize: '1.5rem', color: '#10b981' }}>{stats.approved}</strong></div>
        <div><h3 style={{ margin: 0, opacity: 0.7, fontSize: '0.9rem', color: '#f59e0b' }}>DUPLICADOS</h3><strong style={{ fontSize: '1.5rem', color: '#f59e0b' }}>{stats.duplicates}</strong></div>
        <div><h3 style={{ margin: 0, opacity: 0.7, fontSize: '0.9rem', color: '#ef4444' }}>RECHAZADOS</h3><strong style={{ fontSize: '1.5rem', color: '#ef4444' }}>{stats.rejected}</strong></div>
      </div>

      {/* Layout de 2 columnas: Jobs y Detalles */}
      <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '2rem' }}>
        
        {/* Columna Izquierda: Jobs */}
        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px' }}>
          <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem', marginBottom: '1rem' }}>Import Jobs</h3>
          {jobs.length === 0 && <p style={{ opacity: 0.5 }}>No hay trabajos recientes.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {jobs.map(job => (
              <div 
                key={job.id} 
                onClick={() => setSelectedJob(job)}
                style={{ 
                  padding: '1rem', 
                  background: selectedJob?.id === job.id ? 'rgba(0, 240, 255, 0.1)' : 'rgba(255,255,255,0.05)', 
                  border: `1px solid ${selectedJob?.id === job.id ? 'var(--neon-cyan)' : 'transparent'}`,
                  borderRadius: '8px', 
                  cursor: 'pointer' 
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong>{job.category}</strong>
                  <span style={{ fontSize: '0.8rem', background: job.status === 'completed' ? '#10b981' : job.status === 'processing' ? '#f59e0b' : 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: '4px' }}>
                    {job.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {job.source_url}
                </div>
                <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{job.processed_count} / {job.requested_count} Proc.</span>
                  <span>{new Date(job.created_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Columna Derecha: Staging Area */}
        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.5rem', borderRadius: '12px' }}>
          {selectedJob ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0 }}>Staging Area - Job #{selectedJob.id.split('-')[0]}</h3>
                <span style={{ background: 'rgba(255,255,255,0.1)', padding: '0.5rem', borderRadius: '6px' }}>{jobItems.length} items</span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {jobItems.length === 0 && <p style={{ opacity: 0.5 }}>Cargando items o trabajo vacío...</p>}
                {jobItems.map(item => (
                  <div key={item.id} style={{ display: 'flex', gap: '1rem', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', alignItems: 'center' }}>
                    <img src={item.thumbnail} alt="" style={{ width: '120px', height: '68px', objectFit: 'cover', borderRadius: '4px' }} />
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: '0 0 0.5rem 0' }}>{item.title}</h4>
                      <span style={{ 
                        fontSize: '0.8rem', 
                        background: item.status === 'approved' ? '#10b981' : item.status === 'rejected' ? '#ef4444' : item.status === 'duplicate' ? '#f59e0b' : 'rgba(255,255,255,0.2)', 
                        padding: '2px 6px', 
                        borderRadius: '4px' 
                      }}>
                        {item.status.toUpperCase()}
                      </span>
                    </div>
                    {item.status === 'pending_approval' && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => handleApprove(item.id)} style={{ background: '#10b981', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Aprobar</button>
                        <button onClick={() => handleReject(item.id)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Rechazar</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
              Selecciona un Job para revisar el Staging
            </div>
          )}
        </div>
      </div>

      {/* Modal de Importación */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#18152e', padding: '2rem', borderRadius: '12px', width: '500px', maxWidth: '90%', border: '1px solid var(--neon-cyan)' }}>
            <h2 style={{ margin: '0 0 1.5rem 0', display: 'flex', justifyContent: 'space-between' }}>
              Importar {showModal.toUpperCase()}
              <X style={{ cursor: 'pointer', opacity: 0.5 }} onClick={() => setShowModal(null)} />
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', opacity: 0.8 }}>URL / ID</label>
                <input 
                  type="text" 
                  value={inputUrl} 
                  onChange={e => setInputUrl(e.target.value)}
                  placeholder="https://youtube.com/..." 
                  style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px' }} 
                />
              </div>

              {!previewData ? (
                <button 
                  onClick={handlePreview} 
                  disabled={!inputUrl || loading}
                  style={{ ...btnStyle, background: 'var(--neon-purple)', width: '100%', justifyContent: 'center', marginTop: '1rem' }}
                >
                  {loading ? <RefreshCw size={18} /> : 'Vista Previa'}
                </button>
              ) : (
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', borderLeft: '3px solid var(--neon-cyan)' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Check size={16} className="text-neon-cyan" /> {previewData.title || 'Fuente Encontrada'}</h4>
                  <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.8 }}>{previewData.message}</p>
                  
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem' }}>Categoría</label>
                      <select value={inputCategory} onChange={e => setInputCategory(e.target.value)} style={{ width: '100%', padding: '0.5rem', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '4px' }}>
                        <option value="Historia">Historia</option>
                        <option value="Ciencia">Ciencia</option>
                        <option value="Cine">Cine</option>
                        <option value="Documentales">Documentales</option>
                        <option value="movies_series">Películas & Series</option>
                      </select>
                    </div>
                    <div style={{ width: '100px' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem' }}>Cantidad</label>
                      <input type="number" value={inputLimit} onChange={e => setInputLimit(Number(e.target.value))} style={{ width: '100%', padding: '0.5rem', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '4px' }} />
                    </div>
                  </div>

                  <button 
                    onClick={handleStartImport} 
                    disabled={loading}
                    style={{ ...btnStyle, background: '#10b981', width: '100%', justifyContent: 'center', marginTop: '1.5rem' }}
                  >
                    {loading ? <RefreshCw size={18} /> : `IMPORTAR ${inputLimit}`}
                  </button>
                </div>
              )}

              {error && (
                <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '1rem', borderRadius: '8px', display: 'flex', gap: '0.5rem', color: '#fca5a5' }}>
                  <AlertCircle size={18} /> {error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const btnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '1rem',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'white',
  fontWeight: 'bold',
  borderRadius: '8px',
  cursor: 'pointer',
  transition: 'all 0.2s'
};

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  textAlign: 'left',
  fontSize: '0.75rem',
  fontWeight: 700,
  opacity: 0.5,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: '0.85rem',
  color: '#e5e7eb',
};


