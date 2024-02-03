import { Book } from '@prisma/client';
import { FC } from 'react';
import  create,{ GetState } from 'zustand';
interface IBook extends Book {
  isComplete: boolean;
}
interface BookType extends Book {
  id:string,
  isOpen:boolean,
  book:Book
}
interface IBookUpdateModalStore {
    myBooks: {
    id: string;
    isOpen: boolean;
    book: Book | null;
  }[];
  book: IBook;
  bookId: string;
  onOpen: (bookId: string) => void;
  onClose: (bookId: string) => void;
  setBook: (book: Book,isComplete:boolean) => void;
  getBook: (bookId: string,state: IBookUpdateModalStore) => BookType | Book | undefined
  getBookIsOpen: (bookId: string,state: IBookUpdateModalStore) => boolean | undefined
  getBookId: (bookId: string,state: IBookUpdateModalStore) => string | undefined
  setBookIdState: (bookId: string) => void;
}

export const useBookUpdateModal = create<IBookUpdateModalStore>((set) =>({
  myBooks: [],
  book: null!,
  bookId:"",
  onOpen: (bookId: string) => set((prevState) => ({
    myBooks: prevState.myBooks.map(b => b.id === bookId ? { ...b, isOpen: true } : b)
  })),
  onClose: (bookId: string) => set((prevState) => ({
    myBooks: prevState.myBooks.map(b => b.id === bookId ? { ...b, isOpen: false } : b)
  })),
  setBook: (book: Book,isComplete:boolean) => set((prevState) => ({
    book: {...book,isComplete}
  })),
  setBookIdState: (bookId: string) => set((prevState) => ({
    bookId:bookId
  })),
  getBookIsOpen: (bookId: string, state: IBookUpdateModalStore): boolean | undefined => {
    return state.myBooks.find(book => book.id === bookId)?.isOpen as boolean | undefined;
  },
  getBookId: (bookId: string, state: IBookUpdateModalStore): string | undefined => {
    return state.myBooks.find(book => book.id === bookId)?.id;
  },
  getBook: (bookId: string, state: IBookUpdateModalStore): BookType | Book | undefined => {
    return state.myBooks.find(book => book.id === bookId) as BookType | Book | undefined;
  },
}));

export default useBookUpdateModal;