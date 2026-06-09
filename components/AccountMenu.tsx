"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { UserIcon } from "@/components/icons";
import { logout } from "@/lib/auth-actions";

const ITEMS = [
  { href: "/profile", label: "Profile" },
  { href: "/measurements", label: "Measurement history" },
  { href: "/bloodwork", label: "Blood & lab results" },
  { href: "/settings", label: "Settings" },
  { href: "/report", label: "Doctor report" },
] as const;

export function AccountMenu({ name }: { name?: string }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass =
    "block w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-muted";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
      >
        <UserIcon className="h-5 w-5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg"
        >
          <div className="truncate px-3 py-2 text-xs font-medium text-muted-foreground">
            {name?.trim() || "Account"}
          </div>
          {ITEMS.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              {it.label}
            </Link>
          ))}
          <div className="my-1 h-px bg-border" />
          <form action={logout}>
            <button
              type="submit"
              role="menuitem"
              className={cn(itemClass, "text-muted-foreground")}
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
