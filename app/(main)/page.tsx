"use client"
import { useSession } from "next-auth/react";
import Image from "next/image";
import Container from "../components/Container";
import ProfileHead from "../components/profile-head/ProfileHead";
import useUser from "../hooks/useUser";
import useBooks from "../hooks/useBooks";
import ReadingStats from "../components/profile-head/ReadingStats";
// import getCurrentUser from "../actions/getCurrentUser";

export default function  Home () {
  const {data: session, status} = useSession();
  const {user,isLoading,isError} = useUser();
  const {books,isLoading:isLoadingBooks,isError:isErrorBooks} = useBooks();
  console.log(user);

  if (isLoading) {
    return <div>Loading...</div>
  }
  console.log(books);
  return (
    <main className="">
      <Container>
      <ProfileHead imgSrc={user.image} bannerSrc={user.banner} color={user.favColour}/>
      <div className="flex justify-between items center mt-20">
      <div className="px-12">
      <h1 className="text-3xl font-bold">{user.username}</h1>
      <h1 className="text-md text-gray-500/85 mt-2">{user.bio}</h1>
      </div>
      <ReadingStats books={books}/>
      </div>
      </Container>
    </main>
  );
}
