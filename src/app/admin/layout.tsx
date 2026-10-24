import { requireUser } from "@/lib/auth";
import { logout } from "../login/actions";
import { AdminNav } from "./nav";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireUser();
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-stone-200 bg-white p-3 md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <div className="mb-3 flex items-center justify-between px-3 md:block">
          <div className="text-brand-700 text-lg font-semibold">FleaMaMa</div>
          <form action={logout} className="md:mt-1">
            <span className="mr-2 text-xs text-stone-500 md:block">{user.name}</span>
            <button className="text-xs text-stone-500 underline hover:text-stone-800">Se déconnecter</button>
          </form>
        </div>
        <AdminNav />
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
