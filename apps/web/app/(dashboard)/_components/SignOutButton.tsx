"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/shadcn/Button";

export default function SignOutButton() {
  return (
    <Button variant="outline" onClick={() => void signOut({ callbackUrl: "/" })}>
      Log out
    </Button>
  );
}
