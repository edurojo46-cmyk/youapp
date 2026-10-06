import type { UniversalContent } from './streamingTypes';

/**
 * STREAMING FIXTURES (DEVELOPMENT & FALLBACK DEMO)
 * Contiene metadatos reales de títulos contrastados con TMDB.
 * La disponibilidad está etiquetada explícitamente como demo (`isDemo: true`, `source: 'demo_fixture'`)
 * para que nunca se confunda con verificación de disponibilidad en tiempo real en producción.
 */

export const FIXTURE_HERO_INTERSTELLAR: UniversalContent = {
  id: 'fixture-movie-interstellar',
  type: 'movie',
  title: 'Interstellar',
  originalTitle: 'Interstellar',
  description: 'Un viaje más allá del tiempo para asegurar nuestro futuro. Ante el colapso ambiental de la Tierra, un grupo de exploradores emprende la misión más importante de la historia.',
  year: 2014,
  durationMin: 169,
  durationText: '2h 49m',
  genres: ['Ciencia Ficción', 'Aventura', 'Drama'],
  director: 'Christopher Nolan',
  cast: ['Matthew McConaughey', 'Anne Hathaway', 'Jessica Chastain', 'Michael Caine'],
  rating: 8.7,
  matchScore: 97,
  posterUrl: 'https://image.tmdb.org/t/p/w780/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
  backdropUrl: 'https://image.tmdb.org/t/p/original/rAiYTnrLEkvDvh38ggBTLoYfNc9.jpg',
  primaryProvider: 'prime_video',
  playbackMode: 'external_provider',
  externalIds: {
    tmdb: 157336,
    imdb: 'tt0816692'
  },
  availability: [
    {
      provider: 'prime_video',
      providerName: 'Prime Video',
      country: 'AR',
      access: 'subscription',
      accessLabel: 'Incluida con suscripción (Demo)',
      quality: '4K',
      webUrl: 'https://www.primevideo.com/detail/Interstellar/0ICZ4Y8R2W81NQQ3C68O10W0D4',
      source: 'demo_fixture',
      verifiedAt: '2026-08-31',
      isDemo: true
    },
    {
      provider: 'max',
      providerName: 'Max',
      country: 'AR',
      access: 'subscription',
      accessLabel: 'Incluida con suscripción (Demo)',
      quality: '4K',
      webUrl: 'https://www.max.com',
      source: 'demo_fixture',
      verifiedAt: '2026-08-31',
      isDemo: true
    },
    {
      provider: 'apple_tv_plus',
      providerName: 'Apple TV',
      country: 'AR',
      access: 'rent',
      accessLabel: 'Alquiler desde US$ 3.99',
      price: 3.99,
      currency: 'USD',
      quality: '4K',
      webUrl: 'https://tv.apple.com',
      source: 'demo_fixture',
      verifiedAt: '2026-08-31',
      isDemo: true
    }
  ]
};

export const FIXTURE_RECOMMENDED_TITLES: UniversalContent[] = [
  {
    id: 'fixture-movie-dune-2',
    type: 'movie',
    title: 'Dune: Parte dos',
    originalTitle: 'Dune: Part Two',
    description: 'Paul Atreides se une a Chani y a los Fremen mientras busca venganza contra los conspiradores que destruyeron a su familia.',
    year: 2024,
    durationMin: 166,
    durationText: '2h 46m',
    genres: ['Ciencia Ficción', 'Aventura', 'Acción'],
    director: 'Denis Villeneuve',
    cast: ['Timothée Chalamet', 'Zendaya', 'Rebecca Ferguson', 'Javier Bardem'],
    rating: 8.6,
    matchScore: 92,
    posterUrl: 'https://image.tmdb.org/t/p/w500/czembW0Rk1Ke7raNVucNcP5ESgu.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/original/xOMo8BRK7PfcJv9JCnx7s520b40.jpg',
    primaryProvider: 'max',
    playbackMode: 'external_provider',
    externalIds: { tmdb: 693134 },
    availability: [
      {
        provider: 'max',
        providerName: 'Max',
        country: 'AR',
        access: 'subscription',
        accessLabel: 'Incluida con suscripción (Demo)',
        quality: '4K',
        webUrl: 'https://www.max.com',
        source: 'demo_fixture',
        verifiedAt: '2026-08-31',
        isDemo: true
      }
    ]
  },
  {
    id: 'fixture-movie-laland',
    type: 'movie',
    title: 'La La Land',
    originalTitle: 'La La Land',
    description: 'Un pianista de jazz y una aspirante a actriz se enamoran pero luchan por conciliar sus ambiciones en Los Ángeles.',
    year: 2016,
    durationMin: 128,
    durationText: '2h 8m',
    genres: ['Romance', 'Música', 'Drama'],
    director: 'Damien Chazelle',
    cast: ['Ryan Gosling', 'Emma Stone', 'John Legend'],
    rating: 8.0,
    matchScore: 95,
    posterUrl: 'https://image.tmdb.org/t/p/w500/uDO8zWDhfWwoFdKS4fzkVJt0Rf0.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/original/qJeU7KM4pRqQY9B6w9028hUj09B.jpg',
    primaryProvider: 'apple_tv_plus',
    playbackMode: 'external_provider',
    externalIds: { tmdb: 313369 },
    availability: [
      {
        provider: 'apple_tv_plus',
        providerName: 'Apple TV+',
        country: 'AR',
        access: 'subscription',
        accessLabel: 'Incluida con suscripción (Demo)',
        quality: '4K',
        webUrl: 'https://tv.apple.com',
        source: 'demo_fixture',
        verifiedAt: '2026-08-31',
        isDemo: true
      }
    ]
  },
  {
    id: 'fixture-movie-the-batman',
    type: 'movie',
    title: 'The Batman',
    originalTitle: 'The Batman',
    description: 'En su segundo año luchando contra el crimen, Batman explora la corrupción en Gotham City que se conecta con su propia familia.',
    year: 2022,
    durationMin: 176,
    durationText: '2h 56m',
    genres: ['Crimen', 'Misterio', 'Acción'],
    director: 'Matt Reeves',
    cast: ['Robert Pattinson', 'Zoë Kravitz', 'Paul Dano', 'Colin Farrell'],
    rating: 7.8,
    matchScore: 89,
    posterUrl: 'https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/original/b0PlSFdDwbyK0cf5RxwDpaOJQvQ.jpg',
    primaryProvider: 'max',
    playbackMode: 'external_provider',
    externalIds: { tmdb: 414906 },
    availability: [
      {
        provider: 'max',
        providerName: 'Max',
        country: 'AR',
        access: 'subscription',
        accessLabel: 'Incluida con suscripción (Demo)',
        quality: '4K',
        webUrl: 'https://www.max.com',
        source: 'demo_fixture',
        verifiedAt: '2026-08-31',
        isDemo: true
      }
    ]
  },
  {
    id: 'fixture-movie-spiderman-nwh',
    type: 'movie',
    title: 'Spider-Man: No Way Home',
    originalTitle: 'Spider-Man: No Way Home',
    description: 'Con la identidad de Spider-Man revelada, Peter pide ayuda al Doctor Strange para revertir el secreto, desatando el multiverso.',
    year: 2021,
    durationMin: 148,
    durationText: '2h 28m',
    genres: ['Acción', 'Aventura', 'Ciencia Ficción'],
    director: 'Jon Watts',
    cast: ['Tom Holland', 'Zendaya', 'Benedict Cumberbatch', 'Willem Dafoe'],
    rating: 8.2,
    matchScore: 90,
    posterUrl: 'https://image.tmdb.org/t/p/w500/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/original/14QbnygCuTO0vl7CAFmPf1fgZfV.jpg',
    primaryProvider: 'netflix',
    playbackMode: 'external_provider',
    externalIds: { tmdb: 634649 },
    availability: [
      {
        provider: 'netflix',
        providerName: 'Netflix',
        country: 'AR',
        access: 'subscription',
        accessLabel: 'Incluida con suscripción (Demo)',
        quality: '4K',
        webUrl: 'https://www.netflix.com',
        source: 'demo_fixture',
        verifiedAt: '2026-08-31',
        isDemo: true
      }
    ]
  },
  {
    id: 'fixture-movie-encanto',
    type: 'movie',
    title: 'Encanto',
    originalTitle: 'Encanto',
    description: 'Los Madrigal son una familia extraordinaria que viven escondidos en las montañas de Colombia en un lugar mágico llamado Encanto.',
    year: 2021,
    durationMin: 102,
    durationText: '1h 42m',
    genres: ['Animación', 'Familia', 'Fantasía'],
    director: 'Jared Bush, Byron Howard',
    cast: ['Stephanie Beatriz', 'John Leguizamo', 'Mauro Castillo'],
    rating: 7.6,
    matchScore: 85,
    posterUrl: 'https://image.tmdb.org/t/p/w500/4j0PNHkMr5ax3IA8tjtxcmPU3QT.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/original/3G1Q599HP4bJ9fN9aP87z044b.jpg',
    primaryProvider: 'disney_plus',
    playbackMode: 'external_provider',
    externalIds: { tmdb: 568124 },
    availability: [
      {
        provider: 'disney_plus',
        providerName: 'Disney+',
        country: 'AR',
        access: 'subscription',
        accessLabel: 'Incluida con suscripción (Demo)',
        quality: '4K',
        webUrl: 'https://www.disneyplus.com',
        source: 'demo_fixture',
        verifiedAt: '2026-08-31',
        isDemo: true
      }
    ]
  },
  {
    id: 'fixture-series-the-last-of-us',
    type: 'series',
    title: 'The Last of Us',
    originalTitle: 'The Last of Us',
    description: 'Veinte años después del colapso de la civilización moderna, Joel es contratado para sacar de contrabando a Ellie de una opresiva zona de cuarentena.',
    year: 2023,
    durationText: 'T1 E5 · 57m',
    currentSeasonEpisode: 'T1 E5',
    durationMin: 57,
    genres: ['Drama', 'Ciencia Ficción', 'Acción'],
    director: 'Craig Mazin, Neil Druckmann',
    cast: ['Pedro Pascal', 'Bella Ramsey', 'Gabriel Luna'],
    rating: 8.8,
    matchScore: 93,
    posterUrl: 'https://image.tmdb.org/t/p/w500/uKvVjHNqB5VmOrdxqAt2V7JMrne.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/original/uDgy6hyPd82kOHh6I95FLtLnj6p.jpg',
    primaryProvider: 'max',
    playbackMode: 'external_provider',
    externalIds: { tmdb: 100088 },
    availability: [
      {
        provider: 'max',
        providerName: 'Max',
        country: 'AR',
        access: 'subscription',
        accessLabel: 'Incluida con suscripción (Demo)',
        quality: '4K',
        webUrl: 'https://www.max.com',
        source: 'demo_fixture',
        verifiedAt: '2026-08-31',
        isDemo: true
      }
    ]
  }
];

export const FIXTURE_CONTINUE_WATCHING: UniversalContent[] = [
  {
    id: 'fixture-cw-the-last-of-us',
    type: 'series',
    title: 'The Last of Us',
    currentSeasonEpisode: 'T1 E5',
    durationText: 'T1 E5',
    genres: ['Drama', 'Ciencia Ficción'],
    posterUrl: 'https://image.tmdb.org/t/p/w300/uKvVjHNqB5VmOrdxqAt2V7JMrne.jpg',
    primaryProvider: 'max',
    playbackMode: 'external_provider',
    lastOpenedAt: new Date(Date.now() - 3600000).toISOString(),
    availability: [
      {
        provider: 'max',
        providerName: 'Max',
        country: 'AR',
        access: 'subscription',
        webUrl: 'https://www.max.com',
        source: 'demo_fixture',
        verifiedAt: '2026-08-31',
        isDemo: true
      }
    ]
  },
  {
    id: 'fixture-cw-ted-lasso',
    type: 'series',
    title: 'Ted Lasso',
    currentSeasonEpisode: 'T1 E2',
    durationText: 'T1 E2',
    genres: ['Comedia', 'Drama', 'Deportes'],
    posterUrl: 'https://image.tmdb.org/t/p/w300/3FlKkLp88oRzIqM64s8g3d26H7e.jpg',
    primaryProvider: 'apple_tv_plus',
    playbackMode: 'external_provider',
    lastOpenedAt: new Date(Date.now() - 86400000).toISOString(),
    availability: [
      {
        provider: 'apple_tv_plus',
        providerName: 'Apple TV+',
        country: 'AR',
        access: 'subscription',
        webUrl: 'https://tv.apple.com',
        source: 'demo_fixture',
        verifiedAt: '2026-08-31',
        isDemo: true
      }
    ]
  },
  {
    id: 'fixture-cw-oppenheimer',
    type: 'movie',
    title: 'Oppenheimer',
    year: 2023,
    remainingText: 'Abriste recientemente',
    durationText: '2023',
    genres: ['Drama', 'Historia', 'Biografía'],
    posterUrl: 'https://image.tmdb.org/t/p/w300/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
    primaryProvider: 'prime_video',
    playbackMode: 'external_provider',
    lastOpenedAt: new Date(Date.now() - 172800000).toISOString(),
    availability: [
      {
        provider: 'prime_video',
        providerName: 'Prime Video',
        country: 'AR',
        access: 'subscription',
        webUrl: 'https://www.primevideo.com',
        source: 'demo_fixture',
        verifiedAt: '2026-08-31',
        isDemo: true
      }
    ]
  },
  {
    id: 'fixture-cw-stranger-things',
    type: 'series',
    title: 'Stranger Things',
    currentSeasonEpisode: 'T4 E4',
    durationText: 'T4 E4',
    genres: ['Ciencia Ficción', 'Terror', 'Drama'],
    posterUrl: 'https://image.tmdb.org/t/p/w300/49WJfeN0moxb9IPfGn8AIqMGskD.jpg',
    primaryProvider: 'netflix',
    playbackMode: 'external_provider',
    lastOpenedAt: new Date(Date.now() - 259200000).toISOString(),
    availability: [
      {
        provider: 'netflix',
        providerName: 'Netflix',
        country: 'AR',
        access: 'subscription',
        webUrl: 'https://www.netflix.com',
        source: 'demo_fixture',
        verifiedAt: '2026-08-31',
        isDemo: true
      }
    ]
  }
];

export const FIXTURE_DISCOVERY_CATALOG: UniversalContent[] = [
  FIXTURE_HERO_INTERSTELLAR,
  ...FIXTURE_RECOMMENDED_TITLES,
  {
    id: 'fixture-movie-avatar-2',
    type: 'movie',
    title: 'Avatar: El camino del agua',
    originalTitle: 'Avatar: The Way of Water',
    description: 'Jake Sully vive con su nueva familia en el planeta Pandora una vez que una amenaza conocida regresa.',
    year: 2022,
    durationMin: 192,
    durationText: '3h 12m',
    genres: ['Ciencia Ficción', 'Aventura', 'Acción'],
    director: 'James Cameron',
    cast: ['Sam Worthington', 'Zoe Saldana', 'Sigourney Weaver'],
    rating: 7.7,
    matchScore: 88,
    posterUrl: 'https://image.tmdb.org/t/p/w500/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg',
    primaryProvider: 'disney_plus',
    playbackMode: 'external_provider',
    externalIds: { tmdb: 76600 },
    availability: [
      {
        provider: 'disney_plus',
        providerName: 'Disney+',
        country: 'AR',
        access: 'subscription',
        accessLabel: 'Incluida con suscripción (Demo)',
        webUrl: 'https://www.disneyplus.com',
        source: 'demo_fixture',
        verifiedAt: '2026-08-31',
        isDemo: true
      }
    ]
  },
  {
    id: 'fixture-movie-topgun-maverick',
    type: 'movie',
    title: 'Top Gun: Maverick',
    originalTitle: 'Top Gun: Maverick',
    description: 'Después de más de treinta años de servicio como uno de los mejores aviadores de la Armada, Pete Mitchell está donde pertenece.',
    year: 2022,
    durationMin: 130,
    durationText: '2h 10m',
    genres: ['Acción', 'Drama'],
    director: 'Joseph Kosinski',
    cast: ['Tom Cruise', 'Miles Teller', 'Jennifer Connelly'],
    rating: 8.3,
    matchScore: 94,
    posterUrl: 'https://image.tmdb.org/t/p/w500/62HCnUTziyWcpDaBO2i1DX17ljH.jpg',
    primaryProvider: 'paramount_plus',
    playbackMode: 'external_provider',
    externalIds: { tmdb: 361743 },
    availability: [
      {
        provider: 'paramount_plus',
        providerName: 'Paramount+',
        country: 'AR',
        access: 'subscription',
        accessLabel: 'Incluida con suscripción (Demo)',
        webUrl: 'https://www.paramountplus.com',
        source: 'demo_fixture',
        verifiedAt: '2026-08-31',
        isDemo: true
      }
    ]
  },
  {
    id: 'fixture-series-succession',
    type: 'series',
    title: 'Succession',
    originalTitle: 'Succession',
    description: 'La familia Roy es conocida por controlar Waystar RoyCo, uno de los conglomerados de medios y entretenimiento más grandes del mundo.',
    year: 2023,
    durationText: '4 Temporadas',
    genres: ['Drama'],
    director: 'Jesse Armstrong',
    cast: ['Brian Cox', 'Jeremy Strong', 'Sarah Snook', 'Kieran Culkin'],
    rating: 8.9,
    matchScore: 98,
    posterUrl: 'https://image.tmdb.org/t/p/w500/7udW8W9L5Hsp3q8eQoVj5GfR00B.jpg',
    primaryProvider: 'max',
    playbackMode: 'external_provider',
    externalIds: { tmdb: 76331 },
    availability: [
      {
        provider: 'max',
        providerName: 'Max',
        country: 'AR',
        access: 'subscription',
        accessLabel: 'Incluida con suscripción (Demo)',
        webUrl: 'https://www.max.com',
        source: 'demo_fixture',
        verifiedAt: '2026-08-31',
        isDemo: true
      }
    ]
  }
];
