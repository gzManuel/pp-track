import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { HIDE_MONEY_COOKIE, parseHideMoney } from "@/lib/money-cookie";
import { MoneyVisibilityProvider } from "@/lib/money-visibility";
import DashboardNav from "./_components/DashboardNav";
import HidePricesToggle from "./_components/HidePricesToggle";
import MobileNav from "./_components/MobileNav";
import SignOutButton from "./_components/SignOutButton";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/");

  // Read server-side so hidden amounts are masked in the first HTML byte —
  // no flash of real prices before the client takes over.
  const hideMoney = parseHideMoney((await cookies()).get(HIDE_MONEY_COOKIE)?.value);

  return (
    <MoneyVisibilityProvider initialHidden={hideMoney}>
      <div className="min-h-screen flex flex-col">
        <header className="border-b px-4 py-3 md:px-8 md:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <MobileNav />
            <span className="font-bold text-lg">pp-track</span>
          </div>
          <div className="flex items-center gap-2">
            <HidePricesToggle />
            <SignOutButton />
          </div>
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
    </MoneyVisibilityProvider>
  );
}
