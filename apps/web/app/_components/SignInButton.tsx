"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/shadcn/Button";

export default function SignInButton() {
  return <Button onClick={() => void signIn("google", { callbackUrl: "/dashboard" })}>Sign in with Google</Button>;
}
