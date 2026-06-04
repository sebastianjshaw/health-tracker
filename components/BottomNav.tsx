"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  function scan() {
    // Auto-pick the meal from the current time so a quick scan lands in the right place.
    router.push(`/food/scan?meal=${mealForTime()}&d=${todayISO()}`);
  }

  function renderLink({ href, label, icon: Icon }: (typeof items)[number]) {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        className={cn(
          "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
          active ? "text-accent" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="h-6 w-6" strokeWidth={active ? 2.2 : 1.8} />
        {label}
      </Link>
    );
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 print:hidden">
      <div
        className="mx-auto flex max-w-2xl items-stretch justify-around"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {items.slice(0, 2).map(renderLink)}

        <button
          onClick={scan}
          aria-label="Scan barcode"
          className="flex flex-1 flex-col items-center justify-end gap-1 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg shadow-accent/30 transition-transform active:scale-95">
            <BarcodeIcon className="h-6 w-6" strokeWidth={2} />
          </span>
          Scan
        </button>

        {items.slice(2).map(renderLink)}
      </div>
    </nav>
  );
}
