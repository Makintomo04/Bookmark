import { create } from 'zustand';

export interface EditableListItem {
  workKey: string | null
  title: string
  author: string
  coverUrl: string | null
  pages: number | null
  note: string
  // Display only: who wrote a note carried over from a remixed list. The server works this out itself.
  noteBy?: string | null
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
  // False when staff are editing someone else's list (lib/lists.ts toEditableList).
  isOwner?: boolean
}

// Readers' lists start as their defaultListVisibility preference; staff picks are always public.
export const emptyList = (isStaff = false, visibility: EditableList["visibility"] = "PRIVATE"): EditableList => ({
  title: "",
  description: "",
  visibility: isStaff ? "PUBLIC" : visibility,
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
