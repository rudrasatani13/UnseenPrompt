import { Button } from "@/components/ui/button";

/** A native form keeps sign-out POST-only and lets the server clear auth cookies in its response. */
export function SignOutButton() {
  return (
    <form action="/auth/sign-out" method="post">
      <Button type="submit" variant="outline">
        Sign out
      </Button>
    </form>
  );
}
