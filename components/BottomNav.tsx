"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  ActivityIcon,
  ChartIcon,
  FoodIcon,
  HomeIcon,
  SparkIcon,
} from "./icons";

const items = [
  { href: "/", label: "Today", icon: HomeIcon },
  { href: "/food", label: "Food", icon: FoodIcon },
  { href: "/log", label: "Ask AI", icon: SparkIcon },
  { href: "/activity", label: "Activity", icon: ActivityIcon },
  { href: "/stats", label: "Stats", icon: ChartIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div
        className="mx-auto flex max-w-2xl items-stretch justify-around"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {items.map(({ href, label, icon: Icon }) => {
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
        })}
      </div>
    </nav>
  );
}
