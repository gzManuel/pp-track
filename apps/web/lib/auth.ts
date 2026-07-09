import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import { redirect } from "next/navigation";
import { serverFetch } from "./server-api";

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

  return providers;
}

export const authOptions: NextAuthOptions = {
  providers: configuredProviders(),
  session: {
    strategy: "jwt",
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
        const dbUser = (await res.json()) as { id: string };
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
