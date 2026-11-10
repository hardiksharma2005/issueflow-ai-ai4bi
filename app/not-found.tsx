import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60svh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
        <SearchX className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Button asChild>
        <Link href="/dashboard">Back to overview</Link>
      </Button>
    </main>
  );
}
