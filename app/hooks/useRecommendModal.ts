import { create } from 'zustand';

interface IRecommendModalStore {
  isOpen: boolean;
  bookId: string;
  bookTitle: string;
  onOpen: (bookId: string, bookTitle: string) => void;
  onClose: () => void;
}

export const useRecommendModal = create<IRecommendModalStore>((set) => ({
  isOpen: false,
  bookId: "",
  bookTitle: "",
  onOpen: (bookId: string, bookTitle: string) => set({ isOpen: true, bookId, bookTitle }),
  onClose: () => set({ isOpen: false }),
}));

export default useRecommendModal;
