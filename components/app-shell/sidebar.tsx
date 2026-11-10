"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";

const STORAGE_KEY = "issueflow.sidebar.collapsed";

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 rounded-md px-1 font-semibold tracking-tight">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Zap className="size-4" aria-hidden />
      </span>
      {!collapsed && <span>IssueFlow AI</span>}
    </Link>
  );
}

export function NavLinks({
  collapsed,
  badges,
  onNavigate,
}: {
  collapsed?: boolean;
  badges?: Partial<Record<string, number>>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="grid grid-cols-1 gap-0.5">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const badge = badges?.[item.href];
        const link = (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex h-8 items-center gap-2.5 rounded-md px-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
              active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            <item.icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
            {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
            {!collapsed && badge ? (
              <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-medium text-primary tabular-nums">{badge}</span>
            ) : null}
          </Link>
        );
        if (!collapsed) return link;
        return (
          <Tooltip key={item.href}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">
              {item.label}
              {badge ? ` (${badge})` : ""}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

export function Sidebar({ badges }: { badges?: Partial<Record<string, number>> }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore a per-device preference after hydration
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* storage unavailable: keep default */
    }
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(STORAGE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 md:flex",
        collapsed ? "w-14" : "w-60",
      )}
    >
      <div className={cn("flex h-14 items-center px-3", collapsed && "justify-center px-0")}>
        <Logo collapsed={collapsed} />
      </div>
      <div className={cn("flex-1 overflow-y-auto px-3 py-2", collapsed && "px-2")}>
        <NavLinks collapsed={collapsed} badges={badges} />
      </div>
      <div className={cn("border-t p-2", collapsed && "flex justify-center")}>
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          className={cn(!collapsed && "w-full justify-start text-muted-foreground")}
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          {!collapsed && "Collapse"}
        </Button>
      </div>
    </aside>
  );
}
