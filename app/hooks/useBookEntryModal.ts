import { create } from 'zustand';
import type { BookSearchResult } from '../components/modals/BookSearchResults';

interface IBookEntryModalStore {
  isOpen: boolean;
  prefill: BookSearchResult | null;
  onOpen: (prefill?: BookSearchResult) => void;
  onClose: () => void;
}

export const useBookEntryModal = create<IBookEntryModalStore>((set) =>({
  isOpen:false,
  prefill: null,
  onOpen: (prefill) => set({ isOpen: true, prefill: prefill ?? null }),
  onClose: () => set({ isOpen: false, prefill: null }),
}));

export default useBookEntryModal;
