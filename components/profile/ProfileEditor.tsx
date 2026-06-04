"use client";

import * as React from "react";
import { useTransition } from "react";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { saveProfile } from "@/lib/profile-actions";
import type { Profile, Sex } from "@/lib/settings";

export function ProfileEditor({ profile }: { profile: Profile }) {
  const [p, setP] = React.useState<Profile>(profile);
  const [open, setOpen] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [pending, start] = useTransition();

  const set = (patch: Partial<Profile>) => {
    setP((v) => ({ ...v, ...patch }));
    setSaved(false);
  };

  function save() {
    start(async () => {
      await saveProfile(p);
      setSaved(true);
    });
  }

  return (
    <Card className="p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between font-semibold"
      >
        <span>Profile (for doctor report)</span>
        <span className="text-muted-foreground">{open ? "–" : "+"}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          <Field label="Name">
            <Input value={p.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date of birth">
              <Input
                type="date"
                value={p.dob}
                onChange={(e) => set({ dob: e.target.value })}
              />
            </Field>
            <Field label="Sex">
              <Select value={p.sex} onChange={(e) => set({ sex: e.target.value as Sex })}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </Select>
            </Field>
          </div>
          <Field label="Current medications">
            <Textarea
              rows={2}
              value={p.medications}
              onChange={(e) => set({ medications: e.target.value })}
              placeholder="e.g. none"
            />
          </Field>
          <Field label="Conditions / notes">
            <Textarea
              rows={2}
              value={p.conditions}
              onChange={(e) => set({ conditions: e.target.value })}
              placeholder="e.g. allergies, diagnoses"
            />
          </Field>
          <Button className="w-full" onClick={save} disabled={pending}>
            {pending ? "Saving…" : saved ? "Saved ✓" : "Save profile"}
          </Button>
        </div>
      )}
    </Card>
  );
}
