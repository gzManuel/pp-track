import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import DashboardNav from "./_components/DashboardNav";
import SignOutButton from "./_components/SignOutButton";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/");

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-8 py-4 flex items-center justify-between">
        <span className="font-bold text-lg">pp-track</span>
        <SignOutButton />
      </header>
      <div className="flex flex-1">
        <aside className="w-40 border-r px-4 py-4">
          <DashboardNav />
        </aside>
        <div className="flex-1 p-8">{children}</div>
      </div>
    </div>
  );
}
