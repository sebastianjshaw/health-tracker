"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { RouteThumbnail } from "./RouteThumbnail";
import { CARDIO_LABELS, CARDIO_TYPES, CardioType } from "@/lib/constants";
import { timeOf } from "@/lib/date";
import { nullableNum } from "@/lib/format";
import { formatClock, formatPace, parseSplits } from "@/lib/splits";
import { calculateCardioAvgHr, updateCardio } from "@/lib/activity-actions";
import type { CardioSession } from "@/db/schema";

function CardioDetails({ session }: { session: CardioSession }) {
  const splits = parseSplits(session.splits);
  const stats = [
    session.maxHr != null ? { label: "Max HR", value: `${session.maxHr} bpm` } : null,
    session.elevationGainM != null && session.elevationGainM > 0
      ? { label: "Elevation", value: `↑${Math.round(session.elevationGainM)} m` }
      : null,
    session.relativeEffort != null ? { label: "Relative effort", value: `${session.relativeEffort}` } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  if (!session.gpsTrack && stats.length === 0 && splits.length === 0) return null;

  return (
    <div className="mb-4 space-y-3">
      {session.name?.trim() && <p className="font-medium">{session.name}</p>}
      {session.gpsTrack && (
        <RouteThumbnail track={session.gpsTrack} className="h-40 w-full text-accent" />
      )}
      {stats.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {stats.map((s) => (
            <span key={s.label} className="text-muted-foreground">
              {s.label}: <span className="font-medium text-foreground">{s.value}</span>
            </span>
          ))}
        </div>
      )}
      {splits.length > 0 && (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 font-medium">Split</th>
              <th className="py-1 text-right font-medium">Time</th>
              <th className="py-1 text-right font-medium">Split</th>
              <th className="py-1 text-right font-medium">min/km</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {splits.map((s, i) => (
              <tr key={i}>
                <td className="py-1 font-medium">{s.label}</td>
                <td className="py-1 text-right">{formatClock(s.cumulativeSec)}</td>
                <td className="py-1 text-right text-muted-foreground">{formatClock(s.splitSec)}</td>
                <td className="py-1 text-right text-muted-foreground">{formatPace(s.paceSecPerKm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function CardioEditSheet({
  session,
  onClose,
}: {
  session: CardioSession | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={session != null} onClose={onClose} title="Edit activity">
      {session && <EditForm key={session.id} session={session} onClose={onClose} />}
    </Sheet>
  );
}

function EditForm({ session, onClose }: { session: CardioSession; onClose: () => void }) {
  const router = useRouter();
  const imported = session.source !== "manual";
  const formRef = React.useRef<HTMLFormElement>(null);
  const [type, setType] = React.useState<CardioType>(session.type as CardioType);
  const [avgHr, setAvgHr] = React.useState(session.avgHr != null ? String(session.avgHr) : "");
  const [maxHr, setMaxHr] = React.useState(session.maxHr != null ? String(session.maxHr) : "");
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [calcPending, startCalc] = React.useTransition();
  const [calcMsg, setCalcMsg] = React.useState<string | null>(null);

  // Backfill Avg HR from the day's Google Health samples over this session's
  // start-time + duration window.
  function calcHr() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const time = String(fd.get("time") ?? "").trim();
    const duration = nullableNum(fd.get("duration"));
    startCalc(async () => {
      setCalcMsg(null);
      const r = await calculateCardioAvgHr({ date: session.date, time, durationMin: duration ?? 0 });
      if (!r.ok) {
        setCalcMsg(r.error);
        return;
      }
      setAvgHr(String(r.avgHr));
      setMaxHr(String(r.maxHr));
      setCalcMsg(`Averaged ${r.samples} readings (max ${r.maxHr}).`);
    });
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const notes = String(fd.get("notes") ?? "").trim() || null;
    const time = String(fd.get("time") ?? "").trim();
    start(async () => {
      setError(null);
      const r = await updateCardio(
        imported
          ? { id: session.id, notes }
          : {
              id: session.id,
              type,
              startedAt: time ? `${session.date}T${time}` : null,
              durationMin: nullableNum(fd.get("duration")),
              distanceKm: nullableNum(fd.get("distance")),
              avgHr: nullableNum(fd.get("avgHr")),
              maxHr: nullableNum(fd.get("maxHr")),
              kcal: nullableNum(fd.get("kcal")),
              notes,
            },
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-3">
      <CardioDetails session={session} />
      {imported && (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Imported from {session.source === "race" ? "official race results" : session.source} — only notes can be edited.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select
            value={type}
            disabled={imported}
            onChange={(e) => setType(e.target.value as CardioType)}
          >
            {CARDIO_TYPES.map((t) => (
              <option key={t} value={t}>
                {CARDIO_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Time">
          <Input
            name="time"
            type="time"
            defaultValue={timeOf(session.startedAt) ?? ""}
            disabled={imported}
          />
        </Field>
        <Field label="Duration (min)">
          <Input
            name="duration"
            type="number"
            step="any"
            inputMode="decimal"
            defaultValue={session.durationMin ?? ""}
            disabled={imported}
          />
        </Field>
        <Field label="Distance (km)">
          <Input
            name="distance"
            type="number"
            step="any"
            inputMode="decimal"
            defaultValue={session.distanceKm ?? ""}
            disabled={imported}
          />
        </Field>
        <Field label="Avg HR (bpm)">
          <div className="flex gap-2">
            <Input
              name="avgHr"
              type="number"
              inputMode="numeric"
              value={avgHr}
              onChange={(e) => setAvgHr(e.target.value)}
              disabled={imported}
            />
            {!imported && (
              <Button
                type="button"
                variant="outline"
                onClick={calcHr}
                disabled={calcPending}
                className="h-11 shrink-0 px-3 text-sm"
                title="Average heart rate from Google Health for this time window"
              >
                {calcPending ? "…" : "Calc"}
              </Button>
            )}
          </div>
        </Field>
        <Field label="Max HR (bpm)">
          <Input
            name="maxHr"
            type="number"
            inputMode="numeric"
            value={maxHr}
            onChange={(e) => setMaxHr(e.target.value)}
            disabled={imported}
          />
        </Field>
        <Field label="Calories">
          <Input
            name="kcal"
            type="number"
            inputMode="numeric"
            defaultValue={session.kcal != null ? Math.round(session.kcal) : ""}
            disabled={imported}
          />
        </Field>
      </div>
      {calcMsg && <p className="text-sm text-muted-foreground">{calcMsg}</p>}
      <Field label="Notes">
        <Input name="notes" defaultValue={session.notes ?? ""} placeholder="optional" />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
