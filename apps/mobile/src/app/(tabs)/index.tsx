import { ComingNext } from "@/components/ComingNext";
import { useAuth } from "@/lib/auth";

export default function Library() {
  const username = useAuth((s) => s.user?.username);
  return (
    <ComingNext
      title="Your library"
      description={`Signed in as @${username ?? "you"}. Your shelves, reading goal, reviews and lists come here as the web's profile is ported.`}
    />
  );
}
