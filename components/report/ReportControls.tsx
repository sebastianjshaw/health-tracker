"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { SyncButton } from "@/components/integrations/SyncButton";

export function ReportControls({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const [f, setF] = React.useState(from);
  const [t, setT] = React.useState(to);

  return (
    <div className="mb-6 flex flex-wrap items-end gap-2 print:hidden">
      <Field label="From" className="w-36">
        <Input type="date" value={f} onChange={(e) => setF(e.target.value)} />
      </Field>
      <Field label="To" className="w-36">
        <Input type="date" value={t} onChange={(e) => setT(e.target.value)} />
      </Field>
      <Button
        variant="outline"
        onClick={() => router.push(`/report?from=${f}&to=${t}`)}
      >
        Apply
      </Button>
      <Button onClick={() => window.print()}>Print / Save as PDF</Button>
      {/* Pull the latest weight/body-fat & vitals from Google Health, then refresh. */}
      <SyncButton variant="outline" />
    </div>
  );
}
