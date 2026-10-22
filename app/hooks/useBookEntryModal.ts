import { create } from 'zustand';
import type { BookSearchResult } from '../components/modals/BookSearchResults';

export type EntryShelf = "NOT_STARTED" | "STARTED" | "COMPLETED";

interface IBookEntryModalStore {
  isOpen: boolean;
  prefill: BookSearchResult | null;
  // The shelf the modal starts on, e.g. Reading when the reader was asked for the book they're reading.
  shelf: EntryShelf | null;
  onOpen: (prefill?: BookSearchResult, options?: { shelf?: EntryShelf }) => void;
  onClose: () => void;
}

export const useBookEntryModal = create<IBookEntryModalStore>((set) =>({
  isOpen:false,
  prefill: null,
  shelf: null,
  onOpen: (prefill, options) => set({ isOpen: true, prefill: prefill ?? null, shelf: options?.shelf ?? null }),
  onClose: () => set({ isOpen: false, prefill: null, shelf: null }),
}));

export default useBookEntryModal;
