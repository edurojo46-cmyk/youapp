import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

// Helper de sincronización a la nube para YOUAPP
const syncToCloud = async (table: string, payload: any) => {
  if (!isSupabaseConfigured()) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await supabase.from(table).upsert({ 
        user_id: session.user.id,
        ...payload
      });
    }
  } catch (e) {
    console.error(`Sync error for ${table}:`, e);
  }
};

export interface AlgorithmWeights {
  afinidad: number;
  creadores: number;
  actualidad: number;
  diversidad: number;
  nuevosCreadores: number;
  popularidad: number;
  recomendacionesHumanas: number;
  profundidad: number;
  contenidoLocal: number;
}

export interface AlgorithmRules {
  max30Min: boolean;
  creadoresNuevos20: boolean;
  prioridadArgentina: boolean;
  noRepetido: boolean;
  noPolitica: boolean;
  menosNoticias24h: boolean;
  masDocumentalesNoche: boolean;
}

export interface AlgorithmProfile {
  id: string;
  name: string;
  description: string;
  icon: string; 
  color: string;
  weights: AlgorithmWeights;
  rules: AlgorithmRules;
  aiControl: number; 
  lastUsed: string;
}

export type FollowedCreator = {
  creatorId: string;
  creatorName: string;
  provider: string;
};

export type SavedContent = {
  id: string;
  type: 'video' | 'channel' | 'playlist' | 'signal' | 'you4';
  title: string;
  provider: string;
  savedAt: string;
};

export interface SavedMoment {
  id: string;
  videoId: string;
  videoTitle: string;
  thumbnailUrl?: string;
  speaker?: string;
  startConceptualTime: number;
  momentTime: number;
  endConceptualTime: number;
  aiTitle: string;
  aiSummary: string;
  tags: string[];
  createdAt: string;
}

export const defaultRules: AlgorithmRules = {
  max30Min: false,
  creadoresNuevos20: true,
  prioridadArgentina: false,
  noRepetido: true,
  noPolitica: false,
  menosNoticias24h: false,
  masDocumentalesNoche: false
};

export const defaultAlgorithms: AlgorithmProfile[] = [
  {
    id: 'algo-default-1',
    name: 'Equilibrado',
    description: 'La combinación perfecta de descubrimiento y creadores favoritos.',
    icon: 'Brain',
    color: '#a78bfa',
    weights: { afinidad: 80, creadores: 70, actualidad: 60, diversidad: 80, nuevosCreadores: 40, popularidad: 30, recomendacionesHumanas: 60, profundidad: 50, contenidoLocal: 50 },
    rules: { ...defaultRules },
    aiControl: 50,
    lastUsed: 'Activo ahora'
  },
  {
    id: 'algo-default-2',
    name: 'Informarme',
    description: 'Prioriza actualidad, política y contenido local.',
    icon: 'BookOpen',
    color: '#3b82f6',
    weights: { afinidad: 50, creadores: 80, actualidad: 100, diversidad: 90, nuevosCreadores: 20, popularidad: 60, recomendacionesHumanas: 40, profundidad: 80, contenidoLocal: 90 },
    rules: { ...defaultRules, max30Min: true },
    aiControl: 70,
    lastUsed: 'Ayer'
  }
];

export const defaultMoments: SavedMoment[] = [
  {
    id: 'm1',
    videoId: 'v1',
    videoTitle: 'Entrevista con Juan',
    thumbnailUrl: 'https://images.unsplash.com/photo-1573164713988-8665fc963095?w=400&q=80',
    speaker: 'Invitado',
    momentTime: 2297,
    startConceptualTime: 2284,
    endConceptualTime: 2348,
    aiTitle: 'IA y empleo',
    aiSummary: 'El invitado explica cómo la inteligencia artificial transformará el mercado laboral.',
    tags: ['IA', 'Trabajo', 'Economía', 'Futuro'],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString()
  }
];

export interface YouAppStreamingState {
  savedAlgorithms: AlgorithmProfile[];
  activeAlgorithmId: string;
  setActiveAlgorithmId: (id: string) => void;
  updateAlgorithm: (id: string, updates: Partial<AlgorithmProfile>) => void;
  addAlgorithm: (profile: AlgorithmProfile) => void;

  savedMoments: SavedMoment[];
  addMoment: (moment: SavedMoment) => void;
  removeMoment: (id: string) => void;

  savedContent: SavedContent[];
  saveContent: (content: SavedContent) => void;
  unsaveContent: (id: string) => void;
  isSaved: (id: string) => boolean;

  followedCreators: FollowedCreator[];
  followCreator: (creator: FollowedCreator) => void;
  unfollowCreator: (creatorId: string) => void;
  isFollowing: (creatorId: string) => boolean;
}

export const useYouAppStreamingStore = create<YouAppStreamingState>((set, get) => {
  let initialAlgos = defaultAlgorithms;
  let initialActiveAlgo = defaultAlgorithms[0].id;
  let initialMoments = defaultMoments;

  try {
    const storedAlgos = localStorage.getItem('youapp_saved_algorithms');
    if (storedAlgos) {
      const parsed = JSON.parse(storedAlgos);
      if (Array.isArray(parsed)) initialAlgos = parsed;
    }
    
    const storedActiveAlgo = localStorage.getItem('youapp_active_algorithm_id');
    if (storedActiveAlgo) initialActiveAlgo = storedActiveAlgo;
    
    const storedMoments = localStorage.getItem('youapp_saved_moments');
    if (storedMoments) {
      const parsed = JSON.parse(storedMoments);
      if (Array.isArray(parsed)) initialMoments = parsed;
    }
  } catch (e) {
    console.warn("Failed to load state from localStorage");
  }

  return {
    savedAlgorithms: initialAlgos,
    activeAlgorithmId: initialActiveAlgo,
    savedMoments: initialMoments,
    savedContent: [],
    followedCreators: [],

    setActiveAlgorithmId: (id) => set(() => {
      localStorage.setItem('youapp_active_algorithm_id', id);
      return { activeAlgorithmId: id };
    }),

    updateAlgorithm: (id, updates) => set((state) => {
      const next = state.savedAlgorithms.map(algo => 
        algo.id === id ? { ...algo, ...updates } : algo
      );
      localStorage.setItem('youapp_saved_algorithms', JSON.stringify(next));
      syncToCloud('user_preferences', { search_history: next });
      return { savedAlgorithms: next };
    }),

    addAlgorithm: (profile) => set((state) => {
      const next = [...state.savedAlgorithms, profile];
      localStorage.setItem('youapp_saved_algorithms', JSON.stringify(next));
      syncToCloud('user_preferences', { search_history: next });
      return { savedAlgorithms: next };
    }),
    
    addMoment: (moment) => set(state => {
      const next = [moment, ...state.savedMoments];
      localStorage.setItem('youapp_saved_moments', JSON.stringify(next));
      syncToCloud('user_moments', { moment_data: moment });
      return { savedMoments: next };
    }),

    removeMoment: (id) => set(state => {
      const next = state.savedMoments.filter(m => m.id !== id);
      localStorage.setItem('youapp_saved_moments', JSON.stringify(next));
      return { savedMoments: next };
    }),

    saveContent: (content) => set(state => {
      const next = [content, ...state.savedContent.filter(c => c.id !== content.id)];
      return { savedContent: next };
    }),

    unsaveContent: (id) => set(state => ({
      savedContent: state.savedContent.filter(c => c.id !== id)
    })),

    isSaved: (id: string): boolean => {
      return get().savedContent.some((c: any) => c.id === id);
    },

    followCreator: (creator) => set(state => {
      const next = [creator, ...state.followedCreators.filter(c => c.creatorId !== creator.creatorId)];
      return { followedCreators: next };
    }),

    unfollowCreator: (creatorId) => set(state => ({
      followedCreators: state.followedCreators.filter(c => c.creatorId !== creatorId)
    })),

    isFollowing: (creatorId: string): boolean => {
      return get().followedCreators.some((c: any) => c.creatorId === creatorId);
    }
  };
});
