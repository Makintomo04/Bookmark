import { create } from 'zustand';

interface IAchievementsModalStore {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export const useAchievementsModal = create<IAchievementsModalStore>((set) => ({
  isOpen: false,
  onOpen: () => set({ isOpen: true }),
  onClose: () => set({ isOpen: false }),
}));

export default useAchievementsModal;
