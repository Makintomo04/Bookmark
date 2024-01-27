import { FC, useState } from 'react';
import { create } from 'zustand';

interface IBookEntryModalStore {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export const useBookEntryModal = create<IBookEntryModalStore>((set) =>({
  isOpen:false,
  onOpen: () => set({ isOpen: true }),
  onClose: () => set({ isOpen: false }),
 
}));

export default useBookEntryModal;