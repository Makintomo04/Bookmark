import { create } from 'zustand';
import type { FollowListKind } from '@/lib/follows';

interface IFollowListModalStore {
  isOpen: boolean;
  username: string;
  kind: FollowListKind;
  onOpen: (username: string, kind: FollowListKind) => void;
  setKind: (kind: FollowListKind) => void;
  onClose: () => void;
}

export const useFollowListModal = create<IFollowListModalStore>((set) => ({
  isOpen: false,
  username: "",
  kind: "followers",
  onOpen: (username, kind) => set({ isOpen: true, username, kind }),
  setKind: (kind) => set({ kind }),
  onClose: () => set({ isOpen: false }),
}));

export default useFollowListModal;
