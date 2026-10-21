import { create } from 'zustand';
import type { DiscoverBook } from '@/lib/openLibrary';

interface IBookDetailsModalStore {
  isOpen: boolean;
  book: DiscoverBook | null;
  onOpen: (book: DiscoverBook) => void;
  onClose: () => void;
}

export const useBookDetailsModal = create<IBookDetailsModalStore>((set) => ({
  isOpen: false,
  book: null,
  onOpen: (book) => set({ isOpen: true, book }),
  onClose: () => set({ isOpen: false, book: null }),
}));

export default useBookDetailsModal;
