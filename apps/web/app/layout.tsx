import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "pp-track",
  description: "Track your stock portfolio across USD and ARS.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className="min-h-screen flex flex-col">
        <div className="flex-1">{children}</div>
        <Toaster richColors position="top-center" />
        <footer className="border-t px-4 py-6 text-center text-sm text-muted-foreground md:px-8">
          © {new Date().getFullYear()} pp-track. Track your stock portfolio across USD and ARS.
        </footer>
      </body>
    </html>
  );
}
