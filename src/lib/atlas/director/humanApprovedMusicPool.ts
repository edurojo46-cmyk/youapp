import type { MusicTrackApproval } from './directorTypes.ts';

/**
 * HUMAN APPROVED MUSIC POOL
 * Canonical Pool: ATLAS_HUMAN_APPROVED_MUSIC_POOL
 * Only APPROVED music can be selected by the Director Engine.
 */
export const HUMAN_APPROVED_MUSIC_POOL: MusicTrackApproval[] = [
  {
    trackId: 'REF_SLOW_WAVE_AUTUMN_CAFE_JAZZ',
    title: 'Autumn Cafe Jazz (Just an Excuse for Coffee)',
    artist: 'Slow Wave',
    source: 'YouTube (sKJzZF2BcMM)',
    localPath: '',
    webPath: 'https://www.youtube.com/watch?v=sKJzZF2BcMM',
    status: 'REFERENCE_ONLY',
    THEME: 'CAFÉ JAZZ / INTIMIDAD / REFLEXIÓN',
    EMOTION: 'COZY / INTROSPECTIVE / NOSTALGIC / RELAXED',
    BPM: 72,
    ENERGY: 'LOW',
    INSTRUMENTATION: ['Acoustic Piano', 'Muted Brass', 'Upright Bass', 'Soft Vinyl Warmth'],
    qualityScore: 98
  },
  {
    trackId: 'AUTONOMOUS_DISC_SAX_PIANO_NORDIC',
    title: 'Saxophone and piano Nordic-themed soundtrack. Perfect for movies',
    artist: 'kjartan_abel (FreeSound)',
    source: 'Openverse Audio API',
    localPath: 'public/emotive_audio/disc_13c7036e-503f-43dd-b207-0f8c8546aca0_saxophone_and_piano_nordic_the.mp3',
    webPath: '/emotive_audio/disc_13c7036e-503f-43dd-b207-0f8c8546aca0_saxophone_and_piano_nordic_the.mp3',
    status: 'UNREVIEWED', // Autonomously discovered, awaiting human evaluation
    THEME: 'SOFT CAFE JAZZ / NORDIC CALM',
    EMOTION: 'COZY / CONTEMPLATIVE / INTROSPECTIVE',
    BPM: 72,
    ENERGY: 'LOW',
    INSTRUMENTATION: ['Acoustic Piano', 'Warm Saxophone', 'Subtle Ambient Reverb'],
    qualityScore: 95
  },
  {
    trackId: 'AUTONOMOUS_DISC_JAZZ_PIANO_MEDLEY',
    title: 'Jazzy Vibes #81 - Jazz Piano Medley',
    artist: 'Tri-Tachyon (FreeSound)',
    source: 'Openverse Audio API',
    localPath: 'public/emotive_audio/disc_304468d2-bc8f-4f3a-a313-3b5c7d063e5d_jazzy_vibes_81_jazz_piano_medl.mp3',
    webPath: '/emotive_audio/disc_304468d2-bc8f-4f3a-a313-3b5c7d063e5d_jazzy_vibes_81_jazz_piano_medl.mp3',
    status: 'REJECTED', // Human Feedback: SIMILITUD_PARCIAL, APROBACIÓN=NO. Best partial example (lacks trio ensemble).
    THEME: 'CAFÉ JAZZ / COFFEEHOUSE PIANO',
    EMOTION: 'WARM / RELAXED / NOSTALGIC',
    BPM: 74,
    ENERGY: 'LOW',
    INSTRUMENTATION: ['Solo Acoustic Piano', 'Coffeehouse Swing Chords'],
    qualityScore: 90
  },
  {
    trackId: 'AUTONOMOUS_V3_RAW_VINYL_JAZZ_HIP_HOP',
    title: 'Raw Vinyl Jazz Hip Hop',
    artist: 'Auditone Music Library',
    source: 'Openverse Audio API (Jamendo)',
    localPath: 'public/emotive_audio/disc_936aaed7-196d-418c-b8da-406d347bec41_raw_vinyl_jazz_hip_hop.mp3',
    webPath: '/emotive_audio/disc_936aaed7-196d-418c-b8da-406d347bec41_raw_vinyl_jazz_hip_hop.mp3',
    status: 'UNREVIEWED', // Ranking #1 by pure acoustic quality & similarity (Score 135). Rights: NON_COMMERCIAL (CC BY-NC-SA 3.0).
    THEME: 'VINYL JAZZ LOUNGE / COFFEEHOUSE WARMTH',
    EMOTION: 'WARM / NOSTALGIC / PEACEFUL',
    BPM: 74,
    ENERGY: 'LOW',
    INSTRUMENTATION: ['Acoustic Piano', 'Vinyl Crackle Warmth', 'Smooth Bass', 'Percussion'],
    qualityScore: 135
  },
  {
    trackId: 'AUTONOMOUS_V3_SURREAL_WANDERING',
    title: 'surreal-wandering.mp3',
    artist: 'holisticfox (FreeSound)',
    source: 'Openverse Audio API',
    localPath: 'public/emotive_audio/disc_6e520e47-a421-48bb-96fd-821ae0e4dfc4_surreal_wandering_mp3.mp3',
    webPath: '/emotive_audio/disc_6e520e47-a421-48bb-96fd-821ae0e4dfc4_surreal_wandering_mp3.mp3',
    status: 'UNREVIEWED', // Ranking #2 by pure acoustic quality & similarity (Score 135). Rights: PRODUCTION_ALLOWED (CC0 1.0 Public Domain).
    THEME: 'MELLOW JAZZ BRASS / AMBIENT CONTEMPLATION',
    EMOTION: 'COZY / INTROSPECTIVE / RELAXED',
    BPM: 70,
    ENERGY: 'LOW',
    INSTRUMENTATION: ['Acoustic Piano', 'Muted Brass', 'Strings', 'Cinematic Decays'],
    qualityScore: 135
  },
  {
    trackId: 'AUTONOMOUS_V3_SMOOTH_JAZZ',
    title: 'Smooth Jazz',
    artist: 'Alumo',
    source: 'Openverse Audio API (Jamendo)',
    localPath: 'public/emotive_audio/disc_9fefdda5-e01a-45aa-a929-e0036b72caaa_smooth_jazz.mp3',
    webPath: '/emotive_audio/disc_9fefdda5-e01a-45aa-a929-e0036b72caaa_smooth_jazz.mp3',
    status: 'UNREVIEWED', // Ranking #3 by pure acoustic quality & similarity (Score 120). Rights: NON_COMMERCIAL (CC BY-NC-ND 3.0).
    THEME: 'PEACEFUL LOUNGE PIANO / SMOOTH GROOVE',
    EMOTION: 'PEACEFUL / MELLOW / LOUNGE',
    BPM: 72,
    ENERGY: 'LOW',
    INSTRUMENTATION: ['Acoustic Piano Chords', 'Soft Bass', 'Lounge Groove'],
    qualityScore: 120
  },
  {
    trackId: 'AUTONOMOUS_V2_FAKE_JAZZ_TRIO',
    title: 'Fake Jazz Trio',
    artist: 'Antti Luode',
    source: 'Wikimedia Commons Audio',
    localPath: 'public/emotive_audio/disc_v2_fake_jazz_trio.mp3',
    webPath: '/emotive_audio/disc_v2_fake_jazz_trio.mp3',
    status: 'UNREVIEWED', // Learned from partial feedback: adds piano + upright bass + brush drums
    THEME: 'JAZZ TRIO / COFFEEHOUSE ENSEMBLE',
    EMOTION: 'COZY / UNHURRIED / COFFEEHOUSE',
    BPM: 72,
    ENERGY: 'LOW',
    INSTRUMENTATION: ['Acoustic Piano', 'Upright Bass', 'Brushed Drums'],
    qualityScore: 96
  },
  {
    trackId: 'AUTONOMOUS_V2_STANDARD_JAZZ_BARS',
    title: 'Standard Jazz Bars',
    artist: 'Jason Shaw (Audionautix)',
    source: 'Wikimedia Commons Audio',
    localPath: 'public/emotive_audio/disc_v2_standard_jazz_bars.mp3',
    webPath: '/emotive_audio/disc_v2_standard_jazz_bars.mp3',
    status: 'UNREVIEWED', // Learned from partial feedback: adds mellow muted brass + swing section
    THEME: 'LOUNGE JAZZ / MUTED BRASS & PIANO',
    EMOTION: 'NOSTALGIC / MELLOW / RETRO LOUNGE',
    BPM: 74,
    ENERGY: 'LOW',
    INSTRUMENTATION: ['Acoustic Piano', 'Muted Trumpet/Brass', 'Acoustic Bass', 'Light Drums'],
    qualityScore: 95
  },
  {
    trackId: 'AUTONOMOUS_V2_BLUES_IMPRO',
    title: 'Blues Impro',
    artist: 'kasa90 (FreeSound)',
    source: 'Openverse Audio API',
    localPath: 'public/emotive_audio/disc_v2_blues_impro.mp3',
    webPath: '/emotive_audio/disc_v2_blues_impro.mp3',
    status: 'UNREVIEWED', // Learned from partial feedback: rich acoustic resonance & unhurried tempo
    THEME: 'ACOUSTIC JAZZ PIANO / BLUES COFFEEHOUSE',
    EMOTION: 'INTROSPECTIVE / CONTEMPLATIVE / WARM',
    BPM: 68,
    ENERGY: 'LOW',
    INSTRUMENTATION: ['Grand Piano', 'Natural Room Decay'],
    qualityScore: 92
  },
  {
    trackId: 'AUTONOMOUS_DISC_MELANCHOLIC_JAZZ_PIANO',
    title: 'Jazzy Vibes #89 - Melancholic Jazz Piano',
    artist: 'Tri-Tachyon (FreeSound)',
    source: 'Openverse Audio API',
    localPath: 'public/emotive_audio/disc_abd3dc52-2ae0-48e7-88c6-4ee99664076f_jazzy_vibes_89_melancholic_jaz.mp3',
    webPath: '/emotive_audio/disc_abd3dc52-2ae0-48e7-88c6-4ee99664076f_jazzy_vibes_89_melancholic_jaz.mp3',
    status: 'UNREVIEWED',
    THEME: 'NOIR / MELANCOLÍA / ESPACIO',
    EMOTION: 'MELANCHOLIC / DEEP FOCUS / CALM',
    BPM: 68,
    ENERGY: 'LOW',
    INSTRUMENTATION: ['Minimal Acoustic Piano', 'Minor Chords'],
    qualityScore: 90
  },
  {
    trackId: 'MUS_VIRTUTES',
    title: 'Virtutes Instrumenti',
    artist: 'Kevin MacLeod (CC BY 3.0)',
    source: 'Incompetech',
    localPath: 'public/emotive_audio/virtutes_instrumenti.mp3',
    webPath: '/emotive_audio/virtutes_instrumenti.mp3',
    status: 'REJECTED', // Rejected by human feedback: repetitive / monotonous
    THEME: 'PSICOLOGÍA / REFLEXIÓN',
    EMOTION: 'ETHEREAL / PEACE / INTROSPECTIVE',
    BPM: 74,
    ENERGY: 'LOW',
    INSTRUMENTATION: ['Celtic Flute', 'Acoustic Harp', 'Warm Strings', 'Airy Pads'],
    qualityScore: 70
  },
  {
    trackId: 'MUS_CLEAR_WATERS',
    title: 'Clear Waters',
    artist: 'Kevin MacLeod (CC BY 3.0)',
    source: 'Incompetech',
    localPath: 'public/emotive_audio/clear_waters.mp3',
    webPath: '/emotive_audio/clear_waters.mp3',
    status: 'APPROVED',
    THEME: 'RELIGIÓN / ESPIRITUALIDAD',
    EMOTION: 'CELESTIAL / TRANQUILITY',
    BPM: 72,
    ENERGY: 'LOW',
    INSTRUMENTATION: ['Harp', 'Singing Bowls', 'Orchestral Strings', 'Ethereal Drone'],
    qualityScore: 97
  },
  {
    trackId: 'MUS_TOUCHING_MOMENTS',
    title: 'Touching Moments Two - Higher',
    artist: 'Kevin MacLeod (CC BY 3.0)',
    source: 'Incompetech',
    localPath: 'public/emotive_audio/touching_moments_higher.mp3',
    webPath: '/emotive_audio/touching_moments_higher.mp3',
    status: 'APPROVED',
    THEME: 'FINANZAS / PACIENCIA / CRECIMIENTO',
    EMOTION: 'GROWTH / HOPE / STRATEGIC',
    BPM: 78,
    ENERGY: 'MEDIUM',
    INSTRUMENTATION: ['Soft Piano', 'Ascending Strings', 'Warm Ambient Synth'],
    qualityScore: 98
  },
  {
    trackId: 'MUS_AIRSHIP_SERENITY',
    title: 'Airship Serenity',
    artist: 'Kevin MacLeod (CC BY 3.0)',
    source: 'Incompetech',
    localPath: 'public/emotive_audio/airship_serenity.mp3',
    webPath: '/emotive_audio/airship_serenity.mp3',
    status: 'REJECTED', // Human Feedback: RECHAZADA EXPRESAMENTE. Excluida por el Director Humano por timbre sintético no inmersivo.
    THEME: 'FÍSICA CUÁNTICA / CIENCIA',
    EMOTION: 'COSMIC / WONDER / CONTEMPLATIVE',
    BPM: 74,
    ENERGY: 'LOW',
    INSTRUMENTATION: ['Ethereal Synth Pads', 'Acoustic Flute', 'Space Reverb'],
    qualityScore: 50
  },
  {
    trackId: 'MUS_SOVEREIGN',
    title: 'Sovereign',
    artist: 'Kevin MacLeod (CC BY 3.0)',
    source: 'Incompetech',
    localPath: 'public/emotive_audio/sovereign.mp3',
    webPath: '/emotive_audio/sovereign.mp3',
    status: 'APPROVED',
    THEME: 'VIAJE / ÉPICA EMOCIONAL',
    EMOTION: 'MAJESTIC / NOBLE / EMOTIVE',
    BPM: 80,
    ENERGY: 'MEDIUM',
    INSTRUMENTATION: ['Cinematic Strings', 'Concert Piano', 'Harmonic Brass'],
    qualityScore: 94
  },
  {
    trackId: 'MUS_GYMNOPEDIE_1',
    title: 'Gymnopedie No 1',
    artist: 'Erik Satie / Kevin MacLeod (CC BY 3.0)',
    source: 'Incompetech',
    localPath: 'public/emotive_audio/gymnopedie_no_1.mp3',
    webPath: '/emotive_audio/gymnopedie_no_1.mp3',
    status: 'APPROVED',
    THEME: 'FILOSOFÍA / MELANCOLÍA ILUMINADA',
    EMOTION: 'TIMELESS / PEACE',
    BPM: 65,
    ENERGY: 'LOW',
    INSTRUMENTATION: ['Solo Piano', 'Gentle Reverb'],
    qualityScore: 94
  },
  {
    trackId: 'MUS_CANON_D',
    title: 'Canon in D Major',
    artist: 'Johann Pachelbel / Kevin MacLeod (CC BY 3.0)',
    source: 'Incompetech',
    localPath: 'public/emotive_audio/canon_in_d_major.mp3',
    webPath: '/emotive_audio/canon_in_d_major.mp3',
    status: 'APPROVED',
    THEME: 'ARMONÍA / TRASCENDENCIA',
    EMOTION: 'JOYFUL / HEALING',
    BPM: 76,
    ENERGY: 'MEDIUM',
    INSTRUMENTATION: ['Orchestral Strings', 'Harpsichord', 'Warm Bass'],
    qualityScore: 94
  },
  {
    trackId: 'MUS_AIR_PRELUDE',
    title: 'Air Prelude',
    artist: 'Kevin MacLeod (CC BY 3.0)',
    source: 'Incompetech',
    localPath: 'public/emotive_audio/air_prelude.mp3',
    webPath: '/emotive_audio/air_prelude.mp3',
    status: 'APPROVED',
    THEME: 'CIENCIA / NEUROLOGÍA / DESCUBRIMIENTO',
    EMOTION: 'CONTEMPLATIVE / EXPANSIVE / FOCUS',
    BPM: 72,
    ENERGY: 'LOW',
    INSTRUMENTATION: ['Acoustic Guitar', 'Flute', 'Ambient Strings'],
    qualityScore: 95
  },
  {
    trackId: 'MUS_BATHED_IN_LIGHT',
    title: 'Bathed in Light',
    artist: 'Kevin MacLeod (CC BY 3.0)',
    source: 'Incompetech',
    localPath: 'public/emotive_audio/bathed_in_light.mp3',
    webPath: '/emotive_audio/bathed_in_light.mp3',
    status: 'APPROVED',
    THEME: 'SUPERACIÓN / CLARIDAD MENTAL',
    EMOTION: 'HOPEFUL / WARM / ILLUMINATION',
    BPM: 82,
    ENERGY: 'MEDIUM',
    INSTRUMENTATION: ['Warm Piano', 'Ascending Cellos', 'Gentle Percussion'],
    qualityScore: 96
  },
  {
    trackId: 'MUS_CINEMATIC_RIDGE',
    title: 'Cinematic Ridge (Generic Demo)',
    artist: 'Audionautix',
    source: 'Generic',
    localPath: 'public/emotive_audio/cinematic_ridge.wav',
    webPath: '/emotive_audio/cinematic_ridge.wav',
    status: 'REJECTED',
    THEME: 'DEMO',
    EMOTION: 'FLAT / SYNTHETIC',
    BPM: 110,
    ENERGY: 'MEDIUM',
    INSTRUMENTATION: ['Electronic Synth'],
    qualityScore: 60
  },
  {
    trackId: 'AUTONOMOUS_MIXKIT_FRIGHT_NIGHT',
    title: 'Fright Night',
    artist: 'Michael Ramir C.',
    source: 'Mixkit Stock Music',
    localPath: 'public/emotive_audio/disc_MIX_871_fright_night.mp3',
    webPath: '/emotive_audio/disc_MIX_871_fright_night.mp3',
    status: 'UNREVIEWED', // Discovered autonomously via Mixkit Stock Music expansion. Rights: PRODUCTION_ALLOWED (Mixkit Free License).
    THEME: 'FILM SCORE / ACOUSTIC PIANO / INTROSPECTIVE',
    EMOTION: 'COZY / CONTEMPLATIVE / WARM',
    BPM: 72,
    ENERGY: 'LOW',
    INSTRUMENTATION: ['Acoustic Piano', 'Warm Room Resonance', 'Cinematic Decays'],
    qualityScore: 107
  },
  {
    trackId: 'AUTONOMOUS_MIXKIT_STARING_AT_THE_NIGHT_SKY',
    title: 'Staring at the Night Sky',
    artist: 'Alejandro Magaña (A. M.)',
    source: 'Mixkit Stock Music',
    localPath: 'public/emotive_audio/disc_MIX_168_staring_at_the_night_sky.mp3',
    webPath: '/emotive_audio/disc_MIX_168_staring_at_the_night_sky.mp3',
    status: 'UNREVIEWED', // Discovered autonomously via Mixkit Stock Music expansion. Rights: PRODUCTION_ALLOWED (Mixkit Free License).
    THEME: 'FILM SCORE / NOSTALGIC PIANO / NIGHT AMBIENCE',
    EMOTION: 'INTROSPECTIVE / PEACEFUL / REFLECTIVE',
    BPM: 70,
    ENERGY: 'LOW',
    INSTRUMENTATION: ['Acoustic Piano', 'Mellow Decays', 'Soft Dynamics'],
    qualityScore: 102
  },
  {
    trackId: 'AUTONOMOUS_MIXKIT_DREAMING_BIG',
    title: 'Dreaming Big',
    artist: 'Ahjay Stelino',
    source: 'Mixkit Stock Music',
    localPath: 'public/emotive_audio/disc_MIX_31_dreaming_big.mp3',
    webPath: '/emotive_audio/disc_MIX_31_dreaming_big.mp3',
    status: 'UNREVIEWED', // Discovered autonomously via Mixkit Stock Music expansion. Rights: PRODUCTION_ALLOWED (Mixkit Free License).
    THEME: 'SLOW PIANO / MELLOW CONTEMPLATION',
    EMOTION: 'GENTLE / HOPEFUL / SERENE',
    BPM: 72,
    ENERGY: 'LOW',
    INSTRUMENTATION: ['Gentle Piano', 'Warm Reverberation'],
    qualityScore: 98
  }
];

export function getApprovedTracks(theme?: string): MusicTrackApproval[] {
  const approved = HUMAN_APPROVED_MUSIC_POOL.filter(t => t.status === 'APPROVED');
  if (!theme) return approved;
  const match = approved.filter(t => t.THEME.toLowerCase().includes(theme.toLowerCase()));
  return match.length > 0 ? match : approved;
}
