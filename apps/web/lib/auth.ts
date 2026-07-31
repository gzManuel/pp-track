import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import { redirect } from "next/navigation";
import type { User } from "@repo/api-contract";
import { requireEnv, serverFetch } from "./server-api";

// `next build` imports this module without runtime secrets — skip the fail-fast
// env checks there; they run for real when the server boots/serves.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

// Register only the OAuth providers whose credentials are actually configured,
// so running with just one set up (e.g. only Google in local dev) doesn't force
// every other provider's secrets to be present.
function configuredProviders(): NextAuthOptions["providers"] {
  const providers: NextAuthOptions["providers"] = [];

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }),
    );
  }

  if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
    providers.push(
      FacebookProvider({
        clientId: process.env.FACEBOOK_CLIENT_ID,
        clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      }),
    );
  }

  // Zero providers means sign-in is silently impossible — make it loud instead
  // of a mystery.
  if (providers.length === 0 && !isBuildPhase) {
    console.warn("[auth] No OAuth providers configured — set GOOGLE_* or FACEBOOK_* env vars; sign-in is impossible without one.");
  }

  return providers;
}

export const authOptions: NextAuthOptions = {
  providers: configuredProviders(),
  // Fail fast on a missing secret: next-auth v4 would otherwise only throw
  // lazily at the first production request (and silently generate one in dev).
  secret: isBuildPhase ? process.env.NEXTAUTH_SECRET : requireEnv("NEXTAUTH_SECRET"),
  session: {
    strategy: "jwt",
    // Deliberately shorter than the 30-day default — this app shows finances.
    maxAge: 7 * 24 * 60 * 60,
  },
  pages: {
    // The landing page hosts the app's sign-in UI; without this, protected
    // routes bounce to next-auth's unstyled built-in pages (and auth callback
    // failures land on its default error page).
    signIn: "/",
    error: "/",
  },
  callbacks: {
    async jwt({ token, user }) {
      // `user` is only populated on initial sign-in; next-auth types it as
      // always-present, so silence the resulting "always truthy" report.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (user) {
        const res = await serverFetch("/api/users/upsert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            name: user.name,
            image: user.image,
          }),
        });
        if (!res.ok) throw new Error(`Failed to upsert user: ${String(res.status)}`);
        const dbUser = (await res.json()) as User;
        token.userId = dbUser.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId;
      }
      return session;
    },
  },
};

/**
 * Resolve the signed-in user's id in a server component. The dashboard routes
 * sit behind auth middleware, so a missing session is unexpected — redirect to
 * the sign-in page rather than force every caller to null-check.
 */
export async function getUserId(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user.id) redirect("/");
  return session.user.id;
}
