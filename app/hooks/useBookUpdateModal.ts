import { Book } from '@prisma/client';
import { FC } from 'react';
import  create,{ GetState } from 'zustand';
interface IBook extends Book {
  isComplete: boolean;
}
interface IBookUpdateModalStore {
    myBooks: {
    id: string;
    isOpen: boolean;
    book: Book | null;
  }[];
  book: IBook;
  onOpen: (bookId: string) => void;
  onClose: (bookId: string) => void;
  setBook: (book: Book,isComplete:boolean) => void;
  getBook: (bookId: string,state: IBookUpdateModalStore) => Book | undefined
  getBookIsOpen: (bookId: string,state: IBookUpdateModalStore) => boolean | undefined
  getBookId: (bookId: string,state: IBookUpdateModalStore) => boolean | undefined
  
}

export const useBookUpdateModal = create<IBookUpdateModalStore>((set) =>({
  myBooks: [],
  book: null!,
  onOpen: (bookId: string) => set((prevState) => ({
    myBooks: prevState.myBooks.map(b => b.id === bookId ? { ...b, isOpen: true } : b)
  })),
  onClose: (bookId: string) => set((prevState) => ({
    myBooks: prevState.myBooks.map(b => b.id === bookId ? { ...b, isOpen: false } : b)
  })),
  setBook: (book: Book,isComplete:boolean) => set((prevState) => ({
    book: {...book,isComplete}
  })),
  getBookIsOpen: (bookId: string, state: IBookUpdateModalStore) => {
    return state.myBooks.find(book => book.id === bookId)?.isOpen;
  },
  getBookId: (bookId: string, state: IBookUpdateModalStore) => {
    return state.myBooks.find(book => book.id === bookId)?.id;
  },
  getBook: (bookId: string, state: IBookUpdateModalStore) => {
    return state.myBooks.find(book => book.id === bookId);
  },
}));

export default useBookUpdateModal;