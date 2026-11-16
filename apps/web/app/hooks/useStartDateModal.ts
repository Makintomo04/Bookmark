import { create } from 'zustand';

// A book just started in one tap (Up next's Start): fixes the day it was started, from the toast's "Change date".
interface IStartDateModalStore {
  isOpen: boolean;
  bookId: string;
  bookTitle: string;
  onOpen: (bookId: string, bookTitle: string) => void;
  onClose: () => void;
}

export const useStartDateModal = create<IStartDateModalStore>((set) => ({
  isOpen: false,
  bookId: "",
  bookTitle: "",
  onOpen: (bookId: string, bookTitle: string) => set({ isOpen: true, bookId, bookTitle }),
  onClose: () => set({ isOpen: false }),
}));

export default useStartDateModal;
