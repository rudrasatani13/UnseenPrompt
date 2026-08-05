import { BookOpen, Plus, Search, UserRound, type LucideIcon } from "lucide-react";

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
    label: "New Prompt",
    icon: Plus,
    availability: "available",
    href: "/",
    active: true,
  },
  {
    id: "library",
    label: "Library",
    icon: BookOpen,
    availability: "soon",
    href: null,
    active: false,
  },
  {
    id: "memories",
    label: "Memories",
    icon: BookOpen,
    availability: "soon",
    href: null,
    active: false,
  },
  {
    id: "search",
    label: "Search",
    icon: Search,
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
] as const satisfies readonly ShellNavigationItem[];
