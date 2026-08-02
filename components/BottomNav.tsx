"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/cn";
import { mealForTime } from "@/lib/constants";
import { todayISO } from "@/lib/date";
import {
  ActivityIcon,
  BarcodeIcon,
  ChartIcon,
  FoodIcon,
  HomeIcon,
} from "./icons";

const items = [
  { href: "/", label: "Today", icon: HomeIcon },
  { href: "/food", label: "Food", icon: FoodIcon },
  { href: "/activity", label: "Activity", icon: ActivityIcon },
  { href: "/stats", label: "Stats", icon: ChartIcon },
];

type Item = (typeof items)[number];

/**
 * Icon + label with press feedback. Rendered inside the <Link> so useLinkStatus
 * can report THIS tab's in-flight navigation: on a slow connection the route
 * swap lags the tap, so we light the tab accent + pulse the moment it's pressed
 * (before the page changes) to confirm the tap registered. On a fast/prefetched
 * connection navigation is instant and `pending` is simply skipped.
 */
function NavItemInner({ Icon, label, active }: { Icon: Item["icon"]; label: string; active: boolean }) {
  const { pending } = useLinkStatus();
  const on = active || pending;
  return (
    <span
      className={cn(
        "flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
        on ? "text-accent" : "text-muted-foreground group-hover:text-foreground",
        pending && "animate-pulse",
      )}
    >
      <Icon className="h-6 w-6" strokeWidth={on ? 2.2 : 1.8} />
      {label}
    </span>
  );
}

function NavItem({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      // active:scale-90 gives an instant tactile press even when the navigation
      // itself is slow — feedback that doesn't wait on the network.
      className="group flex flex-1 transition-transform active:scale-90"
    >
      <NavItemInner Icon={item.icon} label={item.label} active={active} />
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [scanPending, startScan] = useTransition();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  function scan() {
    // Auto-pick the meal from the current time so a quick scan lands in the right place.
    // In a transition so the button can show a pending state while the route loads.
    startScan(() => router.push(`/food/scan?meal=${mealForTime()}&d=${todayISO()}`));
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 print:hidden">
      <div
        className="mx-auto flex max-w-2xl items-stretch justify-around"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {items.slice(0, 2).map((it) => (
          <NavItem key={it.href} item={it} active={isActive(it.href)} />
        ))}

        <button
          onClick={scan}
          aria-label="Scan barcode"
          aria-busy={scanPending}
          className="flex flex-1 flex-col items-center justify-end gap-1 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <span
            className={cn(
              "-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg shadow-accent/30 transition-transform active:scale-95",
              scanPending && "scale-95 animate-pulse",
            )}
          >
            <BarcodeIcon className="h-6 w-6" strokeWidth={2} />
          </span>
          Scan
        </button>

        {items.slice(2).map((it) => (
          <NavItem key={it.href} item={it} active={isActive(it.href)} />
        ))}
      </div>
    </nav>
  );
}
