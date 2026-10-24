import { redirect } from "next/navigation";

// The public pages (exhibitor map & requests) come in a later milestone.
export default function Home() {
  redirect("/admin");
}
