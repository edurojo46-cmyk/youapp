import { create } from 'zustand';

export type ToastType = 'success' | 'info' | 'error';

export interface Toast {
  id: string;
  message: string;
  type?: ToastType;
}

export type ModalType = 'ask' | 'summary' | null;

interface UIState {
  // Toasts
  toasts: Toast[];
  showToast: (message: string, type?: ToastType) => void;
  dismissToast: (id: string) => void;
  
  // Modals
  activeModal: ModalType;
  modalContext: any; // Context payload for the modal (e.g., video block info)
  openModal: (type: ModalType, context?: any) => void;
  closeModal: () => void;
}

let toastIdCounter = 0;

export const useUIStore = create<UIState>((set) => ({
  toasts: [],
  showToast: (message, type = 'info') => {
    const id = `toast-${toastIdCounter++}`;
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }]
    }));
    
    // Auto-dismiss after 3.5s
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter(t => t.id !== id)
      }));
    }, 3500);
  },
  dismissToast: (id) => set((state) => ({
    toasts: state.toasts.filter(t => t.id !== id)
  })),

  activeModal: null,
  modalContext: null,
  openModal: (type, context = null) => set({ activeModal: type, modalContext: context }),
  closeModal: () => set({ activeModal: null, modalContext: null })
}));
