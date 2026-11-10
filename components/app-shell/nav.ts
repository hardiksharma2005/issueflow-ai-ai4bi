import {
  BarChart3,
  CheckSquare,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  Settings,
  Upload,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/domain";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[];
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/issues", label: "All Issues", icon: ListTodo },
  { href: "/imports", label: "Imports", icon: Upload },
  { href: "/my-tasks", label: "My Tasks", icon: CheckSquare },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/team", label: "Team Members", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];
