import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges conditional class names and resolves conflicting Tailwind utilities so
 * the last declared utility wins. Owned locally under `@/components/ui/utils`;
 * `src/lib/utils.ts` intentionally does not exist.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
