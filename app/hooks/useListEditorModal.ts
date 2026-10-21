import { create } from 'zustand';

export interface EditableListItem {
  workKey: string | null
  title: string
  author: string
  coverUrl: string | null
  pages: number | null
  note: string
}

// Plain JSON (dates as yyyy-mm-dd) so it can be handed over from a server component.
export interface EditableList {
  id?: string
  title: string
  description: string
  visibility: "PRIVATE" | "PUBLIC"
  genres: string[]
  tags: string[]
  isPick: boolean
  hidden: boolean
  featuredLabel: string
  featuredFrom: string
  featuredUntil: string
  items: EditableListItem[]
}

export const emptyList = (isStaff = false): EditableList => ({
  title: "",
  description: "",
  visibility: isStaff ? "PUBLIC" : "PRIVATE",
  genres: [],
  tags: [],
  isPick: isStaff,
  hidden: false,
  featuredLabel: "",
  featuredFrom: "",
  featuredUntil: "",
  items: [],
});

interface IListEditorModalStore {
  isOpen: boolean;
  list: EditableList | null;
  onOpen: (list: EditableList) => void;
  onClose: () => void;
}

export const useListEditorModal = create<IListEditorModalStore>((set) => ({
  isOpen: false,
  list: null,
  onOpen: (list) => set({ isOpen: true, list }),
  onClose: () => set({ isOpen: false }),
}));

export default useListEditorModal;
