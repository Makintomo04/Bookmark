import { create } from 'zustand';
import type { BookSearchResult } from '../components/modals/BookSearchResults';

export type EntryShelf = "NOT_STARTED" | "STARTED" | "COMPLETED";

interface IBookEntryModalStore {
  isOpen: boolean;
  prefill: BookSearchResult | null;
  // The shelf the modal starts on, e.g. Reading when the reader was asked for the book they're reading.
  shelf: EntryShelf | null;
  // Opened to start a reading circle: the "Start a reading circle for this book" switch starts on.
  startCircle: boolean;
  onOpen: (prefill?: BookSearchResult, options?: { shelf?: EntryShelf, startCircle?: boolean }) => void;
  onClose: () => void;
}

export const useBookEntryModal = create<IBookEntryModalStore>((set) =>({
  isOpen:false,
  prefill: null,
  shelf: null,
  startCircle: false,
  onOpen: (prefill, options) => set({ isOpen: true, prefill: prefill ?? null, shelf: options?.shelf ?? null, startCircle: !!options?.startCircle }),
  onClose: () => set({ isOpen: false, prefill: null, shelf: null, startCircle: false }),
}));

export default useBookEntryModal;
