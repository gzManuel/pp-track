import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware() {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        if (req.nextUrl.pathname === "/") return true;
        return !!token;
      },
    },
  },
);

export const config = {
  // Skip auth for next-auth routes, Next internals, and any file-looking path
  // (robots.txt, images, manifests) so public static assets aren't gated.
  matcher: ["/((?!api/auth|_next/static|_next/image|.*\\..*).*)"],
};
