"use client";

import { useTransition } from "react";
import { TrashIcon } from "./icons";

/** Trash icon button that runs a server action inside a transition,
 * with an optional confirm prompt. */
export function DeleteButton({
  onDelete,
  label,
  confirm,
}: {
  onDelete: () => Promise<unknown> | void;
  label: string;
  confirm?: string;
}) {
  const [pending, start] = useTransition();

  function handle() {
    if (confirm && !window.confirm(confirm)) return;
    start(async () => {
      await onDelete();
    });
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      aria-label={label}
      className="shrink-0 p-1.5 text-muted-foreground hover:text-danger disabled:opacity-50"
    >
      <TrashIcon className="h-4 w-4" />
    </button>
  );
}
