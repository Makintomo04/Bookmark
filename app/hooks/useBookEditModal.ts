import { Book } from '@prisma/client';
import { create } from 'zustand';

interface IBookEditModalStore {
  isOpen: boolean;
  book: Book | null;
  onOpen: (book: Book) => void;
  onClose: () => void;
}

export const useBookEditModal = create<IBookEditModalStore>((set) => ({
  isOpen: false,
  book: null,
  onOpen: (book: Book) => set({ isOpen: true, book }),
  onClose: () => set({ isOpen: false }),
}));

export default useBookEditModal;
