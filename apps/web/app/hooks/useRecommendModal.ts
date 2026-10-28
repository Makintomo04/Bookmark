import { create } from 'zustand';

interface IRecommendModalStore {
  isOpen: boolean;
  bookId: string;
  // Set instead of bookId when sending from a book page without the book on your shelf: the page's key.
  bookKey: string;
  bookTitle: string;
  onOpen: (bookId: string, bookTitle: string) => void;
  onOpenFromPage: (bookKey: string, bookTitle: string) => void;
  onClose: () => void;
}

export const useRecommendModal = create<IRecommendModalStore>((set) => ({
  isOpen: false,
  bookId: "",
  bookKey: "",
  bookTitle: "",
  onOpen: (bookId: string, bookTitle: string) => set({ isOpen: true, bookId, bookKey: "", bookTitle }),
  onOpenFromPage: (bookKey: string, bookTitle: string) => set({ isOpen: true, bookId: "", bookKey, bookTitle }),
  onClose: () => set({ isOpen: false }),
}));

export default useRecommendModal;
