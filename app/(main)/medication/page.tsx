import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui";
import { WeightChart } from "@/components/stats/Charts";
import { MedDoseForm } from "@/components/medication/MedDoseForm";
import { MedCheckin } from "@/components/medication/MedCheckin";
import { MedDoseList } from "@/components/medication/MedDoseList";
import { todayISO } from "@/lib/date";
import { getGoalWeight } from "@/lib/settings";
import { getWeightSeries } from "@/lib/stats-data";
import {
  getCheckin,
  getDoseMarkers,
  getDoses,
  getNextDoseInfo,
  parseSideEffects,
  type NextDoseInfo,
} from "@/lib/medication-data";

function dueText(n: NextDoseInfo): { label: string; tone: string } {
  switch (n.status) {
    case "none":
      return { label: "No injections logged yet.", tone: "text-muted-foreground" };
    case "due-today":
      return { label: "Next dose due today.", tone: "text-accent" };
    case "overdue":
      return {
        label: `Dose overdue by ${-n.days} day${n.days === -1 ? "" : "s"} (was due ${n.dueDate}).`,
        tone: "text-danger",
      };
    default:
      return {
        label: `Next dose due in ${n.days} day${n.days === 1 ? "" : "s"} (${n.dueDate}).`,
        tone: "text-foreground",
      };
  }
}

export default async function MedicationPage() {
  const today = todayISO();
  const [doses, checkin, weight, doseMarkers, next, goalWeight] = await Promise.all([
    getDoses(),
    getCheckin(today),
    getWeightSeries(),
    getDoseMarkers(),
    getNextDoseInfo(today),
    getGoalWeight(),
  ]);

  const due = dueText(next);

  return (
    <div className="space-y-4">
      <PageHeader title="Medication" subtitle="GLP-1 injections, effects & weight response" />

      <Card className="p-4">
        <p className={`text-sm font-medium ${due.tone}`}>{due.label}</p>
        {next.last && (
          <p className="mt-1 text-xs text-muted-foreground">
            Last: {next.last.drug}
            {next.last.doseMg != null ? ` ${next.last.doseMg} mg` : ""} on {next.last.date}
          </p>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold">Log injection</h2>
        <MedDoseForm today={today} />
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold">Today&apos;s check-in</h2>
        <MedCheckin
          key={today}
          date={today}
          appetite={checkin?.appetite ?? null}
          sideEffects={parseSideEffects(checkin?.sideEffects)}
          notes={checkin?.notes ?? null}
        />
      </Card>

      <WeightChart
        data={weight}
        goalWeight={goalWeight}
        today={today}
        doseMarkers={doseMarkers.map((m) => ({ date: m.date, label: m.label }))}
      />

      <div>
        <h2 className="mb-2 font-semibold">History</h2>
        <MedDoseList doses={doses} />
      </div>
    </div>
  );
}
