"use client";

import { useTransition } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui";
import { TrashIcon } from "@/components/icons";
import { servingLabel, trimNum } from "@/lib/format";
import {
  deleteLogEntry,
  removeRecurringFromDay,
  setLogQuantity,
} from "@/lib/log-actions";
import type { DayEntry } from "@/lib/food-data";

export function EntryRow({ entry, date }: { entry: DayEntry; date: string }) {
  const [pending, start] = useTransition();

  const kcal = Math.round(entry.kcal * entry.quantity);
  const protein = Math.round(entry.protein * entry.quantity);
  const carbs = Math.round(entry.carbs * entry.quantity);
  const fat = Math.round(entry.fat * entry.quantity);

  function remove() {
    start(async () => {
      if (entry.kind === "logged" && entry.logId != null) {
        await deleteLogEntry(entry.logId);
      } else if (entry.recurringId != null) {
        await removeRecurringFromDay(date, entry.recurringId);
      }
    });
  }

  function changeQty(delta: number) {
    if (entry.kind !== "logged" || entry.logId == null) return;
    const next = Number((entry.quantity + delta).toFixed(2));
    start(async () => {
      await setLogQuantity(entry.logId!, next);
    });
  }

  return (
    <div className={cn("flex items-center gap-2 py-2", pending && "opacity-50")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{entry.name}</span>
          {entry.kind === "recurring" && <Badge>default</Badge>}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {servingLabel(entry.quantity, entry.servingSize, entry.servingUnit)} ·{" "}
          {kcal} kcal · P{protein} C{carbs} F{fat}
        </div>
      </div>

      {entry.kind === "logged" && (
        <div className="flex items-center rounded-lg border border-border text-sm">
          <button
            onClick={() => changeQty(-0.5)}
            className="px-2 py-1 text-muted-foreground hover:text-foreground"
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="w-7 text-center tabular-nums">{trimNum(entry.quantity)}</span>
          <button
            onClick={() => changeQty(0.5)}
            className="px-2 py-1 text-muted-foreground hover:text-foreground"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      )}

      <button
        onClick={remove}
        disabled={pending}
        className="p-1.5 text-muted-foreground hover:text-danger"
        aria-label={`Remove ${entry.name}`}
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
