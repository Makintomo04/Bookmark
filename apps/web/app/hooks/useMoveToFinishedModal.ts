import { create } from 'zustand';

// Moving a book that's already on a shelf to Finished: asks whether it was finished this year, and for a rating.
interface IMoveToFinishedModalStore {
  isOpen: boolean;
  bookId: string;
  bookTitle: string;
  onOpen: (bookId: string, bookTitle: string) => void;
  onClose: () => void;
}

export const useMoveToFinishedModal = create<IMoveToFinishedModalStore>((set) => ({
  isOpen: false,
  bookId: "",
  bookTitle: "",
  onOpen: (bookId: string, bookTitle: string) => set({ isOpen: true, bookId, bookTitle }),
  onClose: () => set({ isOpen: false }),
}));

export default useMoveToFinishedModal;
