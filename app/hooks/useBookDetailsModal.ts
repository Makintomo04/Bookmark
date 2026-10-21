import { create } from 'zustand';
import type { DiscoverBook } from '@/lib/openLibrary';
import type { Reason } from '@/lib/listRules';

interface IBookDetailsModalStore {
  isOpen: boolean;
  book: DiscoverBook | null;
  // The curator's note when the book was opened from a list, shown as "why you'd like this".
  reason: Reason | null;
  onOpen: (book: DiscoverBook, reason?: Reason | null) => void;
  onClose: () => void;
}

export const useBookDetailsModal = create<IBookDetailsModalStore>((set) => ({
  isOpen: false,
  book: null,
  reason: null,
  onOpen: (book, reason = null) => set({ isOpen: true, book, reason }),
  onClose: () => set({ isOpen: false, book: null, reason: null }),
}));

export default useBookDetailsModal;
