import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

// Deterministic, muted background per person so avatars are recognisable.
const TONES = ["bg-sky-500/15 text-sky-700 dark:text-sky-300", "bg-violet-500/15 text-violet-700 dark:text-violet-300", "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", "bg-amber-500/15 text-amber-700 dark:text-amber-300", "bg-rose-500/15 text-rose-700 dark:text-rose-300"];

function tone(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export function UserAvatar({
  name,
  size = "default",
  className,
}: {
  name: string | null | undefined;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} className={className}>
      <AvatarFallback className={cn("text-[11px] font-medium", tone(name ?? "?"))}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

export function PersonLabel({ name, className }: { name: string | null | undefined; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <UserAvatar name={name ?? "?"} size="sm" />
      <span className="truncate">{name ?? "Unassigned"}</span>
    </span>
  );
}
