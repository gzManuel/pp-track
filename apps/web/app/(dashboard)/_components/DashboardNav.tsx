"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/portfolios", label: "Portfolios" },
  { href: "/transactions", label: "Transactions" },
];

export default function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`flex min-h-11 items-center px-3 py-2 text-sm font-medium rounded-md transition-colors md:min-h-0 ${
            pathname === href
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50 active:bg-muted/50 active:text-foreground"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
