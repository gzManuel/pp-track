"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shadcn/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/shadcn/Dialog";
import { Input } from "@/components/shadcn/Input";
import { Label } from "@/components/shadcn/Label";
import { createPortfolio } from "../actions";

export default function CreatePortfolioDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    startTransition(async () => {
      await createPortfolio(name.trim());
      setOpen(false);
      setName("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create your first portfolio</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New portfolio</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="portfolio-name">Portfolio name</Label>
            <Input
              id="portfolio-name"
              placeholder="e.g. My Portfolio"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- dialog input should focus on open
              autoFocus
            />
          </div>
          <Button type="submit" disabled={isPending || !name.trim()}>
            {isPending ? "Creating..." : "Create portfolio"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
