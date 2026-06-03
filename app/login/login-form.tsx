"use client";

import { useActionState } from "react";
import { Button, Input } from "@/components/ui";
import { login, type LoginState } from "./actions";

const initial: LoginState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, initial);

  return (
    <form action={action} className="w-full space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <Input
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
          aria-label="Password"
        />
        {state.error && (
          <p className="mt-2 text-sm text-danger">{state.error}</p>
        )}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
