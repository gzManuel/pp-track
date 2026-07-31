import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import DashboardNav from "./_components/DashboardNav";
import MobileNav from "./_components/MobileNav";
import SignOutButton from "./_components/SignOutButton";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/");

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-4 py-3 md:px-8 md:py-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <MobileNav />
          <span className="font-bold text-lg">pp-track</span>
        </div>
        <SignOutButton />
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-40 border-r px-4 py-4 md:block">
          <DashboardNav />
        </aside>
        {/* min-w-0 lets this flex child shrink below its content's intrinsic
            width — without it a wide table forces the page to scroll sideways. */}
        <div className="min-w-0 flex-1 p-4 md:p-8">{children}</div>
      </div>
    </div>
  );
}
