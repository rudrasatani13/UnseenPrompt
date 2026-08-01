import { ChartNoAxesColumn, Folder, Plus, UserRound, type LucideIcon } from "lucide-react";

export type ShellNavigationItem =
  | {
      readonly id: string;
      readonly label: string;
      readonly icon: LucideIcon;
      readonly availability: "available";
      readonly href: string;
      readonly active: boolean;
    }
  | {
      readonly id: string;
      readonly label: string;
      readonly icon: LucideIcon;
      readonly availability: "soon";
      readonly href: null;
      readonly active: false;
    };

/**
 * Phase 2 product navigation fixture.
 *
 * Unavailable destinations cannot be expressed as links. New Project and Profile
 * are interactive in this phase; Projects and Usage surface a visible Soon label.
 */
export const productNavigation = [
  {
    id: "new-project",
    label: "New Project",
    icon: Plus,
    availability: "available",
    href: "/",
    active: true,
  },
  {
    id: "projects",
    label: "Projects",
    icon: Folder,
    availability: "soon",
    href: null,
    active: false,
  },
  {
    id: "profile",
    label: "Profile",
    icon: UserRound,
    availability: "available",
    href: "/profile",
    active: false,
  },
  {
    id: "usage",
    label: "Usage",
    icon: ChartNoAxesColumn,
    availability: "soon",
    href: null,
    active: false,
  },
] as const satisfies readonly ShellNavigationItem[];
