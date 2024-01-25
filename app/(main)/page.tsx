"use client"
import { useSession } from "next-auth/react";
import Image from "next/image";
import Container from "../components/Container";

export default function Home() {
  const {data: session, status} = useSession();
  console.log("status", status);
  console.log("session", session);
  return (
    <main className="">
      <Container>
      Main

      </Container>
    </main>
  );
}
