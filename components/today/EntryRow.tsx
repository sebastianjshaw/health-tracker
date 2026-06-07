"use client";

import * as React from "react";
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
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");

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

  function setQty(next: number) {
    if (entry.kind !== "logged" || entry.logId == null) return;
    const clean = Number(next.toFixed(2));
    if (!Number.isFinite(clean) || clean < 0) return;
    start(async () => {
      await setLogQuantity(entry.logId!, clean);
    });
  }

  function startEdit() {
    if (entry.kind !== "logged") return;
    setDraft(trimNum(entry.quantity));
    setEditing(true);
  }

  function commitEdit() {
    setEditing(false);
    const val = parseFloat(draft.replace(",", "."));
    if (Number.isFinite(val) && val > 0 && val !== entry.quantity) setQty(val);
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
            onClick={() => setQty(entry.quantity - 1)}
            disabled={pending || entry.quantity <= 1}
            className="px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label="Decrease quantity by 1"
          >
            −
          </button>
          {editing ? (
            <input
              type="number"
              step="any"
              inputMode="decimal"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={(e) => e.target.select()}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-12 bg-transparent text-center tabular-nums focus-visible:outline-none"
              aria-label="Set quantity"
            />
          ) : (
            <button
              onClick={startEdit}
              className="w-9 text-center tabular-nums hover:text-foreground"
              aria-label={`Quantity ${trimNum(entry.quantity)} — tap to edit`}
            >
              {trimNum(entry.quantity)}
            </button>
          )}
          <button
            onClick={() => setQty(entry.quantity + 1)}
            disabled={pending}
            className="px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label="Increase quantity by 1"
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
