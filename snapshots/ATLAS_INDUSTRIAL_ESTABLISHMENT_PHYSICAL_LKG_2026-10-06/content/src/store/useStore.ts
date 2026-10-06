import { useAtlasAuthStore, type User, type AtlasAuthState } from './atlas/atlasAuthStore';
import { useYouAppPlayerStore, type YouAppPlayerState } from './youapp/youappPlayerStore';
import { 
  useYouAppStreamingStore, 
  type YouAppStreamingState, 
  type AlgorithmProfile, 
  type AlgorithmRules, 
  type AlgorithmWeights, 
  type FollowedCreator, 
  type SavedContent, 
  type SavedMoment, 
  defaultRules, 
  defaultAlgorithms 
} from './youapp/youappStreamingStore';

export { useAtlasAuthStore, useAtlasAuthStore as useAtlasUserStore } from './atlas/atlasAuthStore';
export { useYouAppPlayerStore } from './youapp/youappPlayerStore';
export { useYouAppStreamingStore } from './youapp/youappStreamingStore';
export type { User, AlgorithmWeights, AlgorithmRules, AlgorithmProfile, FollowedCreator, SavedContent, SavedMoment };
export { defaultRules, defaultAlgorithms };

export type CompositeAppState = AtlasAuthState & YouAppPlayerState & YouAppStreamingState;

// Composite hook with full backward compatibility: supports useStore() and useStore(selector)
export function useStore<T = CompositeAppState>(selector?: (state: CompositeAppState) => T): T {
  const auth = useAtlasAuthStore();
  const player = useYouAppPlayerStore();
  const streaming = useYouAppStreamingStore();

  const composite: CompositeAppState = {
    ...auth,
    ...player,
    ...streaming
  };

  if (selector) {
    return selector(composite);
  }

  return composite as unknown as T;
}

// Backward compatibility for getState, setState, subscribe
useStore.getState = (): CompositeAppState => ({
  ...useAtlasAuthStore.getState(),
  ...useYouAppPlayerStore.getState(),
  ...useYouAppStreamingStore.getState()
});

useStore.setState = (partial: any) => {
  const updates = typeof partial === 'function' ? partial(useStore.getState()) : partial;
  if (!updates) return;

  if ('user' in updates || 'loading' in updates) {
    useAtlasAuthStore.setState(updates);
  }
  if ('activeChannelId' in updates) {
    useYouAppPlayerStore.setState(updates);
  }
  useYouAppStreamingStore.setState(updates);
};

useStore.subscribe = (listener: (state: CompositeAppState, prevState: CompositeAppState) => void) => {
  let prev = useStore.getState();
  const notify = () => {
    const next = useStore.getState();
    listener(next, prev);
    prev = next;
  };

  const u1 = useAtlasAuthStore.subscribe(notify);
  const u2 = useYouAppPlayerStore.subscribe(notify);
  const u3 = useYouAppStreamingStore.subscribe(notify);

  return () => {
    u1();
    u2();
    u3();
  };
};
