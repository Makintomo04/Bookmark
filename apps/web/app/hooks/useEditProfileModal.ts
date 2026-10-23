import { FC, useState } from 'react';
import { create } from 'zustand';

interface IEditProfileModalStore {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export const useEditProfileModal = create<IEditProfileModalStore>((set) =>({
  isOpen:false,
  onOpen: () => set({ isOpen: true }),
  onClose: () => set({ isOpen: false }),
 
}));

export default useEditProfileModal;