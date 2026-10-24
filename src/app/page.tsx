import { redirect } from "next/navigation";

// The public entry point is the request page; organisers use /admin.
export default function Home() {
  redirect("/reserver");
}
