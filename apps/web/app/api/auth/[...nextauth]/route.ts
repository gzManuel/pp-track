import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// next-auth v4's NextAuth() is typed as returning `any` for the App Router.
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
