import { Card } from "@/components/ui";
import { fmtMod, type Character } from "@/lib/character";

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-4 py-2 text-center">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

export function CharacterSheet({ character, name }: { character: Character; name: string }) {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Character</div>
            <h2 className="text-2xl font-bold">{name}</h2>
            <div className="text-sm text-accent">{character.title}</div>
          </div>
          <div className="flex gap-2">
            <StatChip label="HP" value={character.hp} />
            <StatChip label="AC" value={character.ac} />
            <StatChip label="Prof" value={fmtMod(character.proficiency)} />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {character.abilities.map((a) => (
          <div
            key={a.key}
            className="rounded-xl border border-border bg-muted/40 px-2 py-3 text-center"
            title={a.basis}
          >
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {a.label.slice(0, 3)}
            </div>
            <div className="text-3xl font-bold leading-tight tabular-nums">{fmtMod(a.modifier)}</div>
            <div className="text-xs text-muted-foreground">{a.score}</div>
          </div>
        ))}
      </div>

      <Card className="divide-y divide-border p-0">
        {character.abilities.map((a) => (
          <div key={a.key} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{a.label}</span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {a.score} ({fmtMod(a.modifier)})
              </span>
            </div>
            <p className="mt-0.5 text-sm text-foreground">{a.note}</p>
            <p className="text-xs text-muted-foreground">from {a.basis}</p>
          </div>
        ))}
      </Card>

      <Card className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Notes from the DM</div>
        <p className="mt-1 text-sm">{character.dmNote}</p>
      </Card>

      <p className="px-1 text-xs text-muted-foreground">
        Rolled from your tracked data ({character.derivedFrom.join(" · ")}). Scores use the 3–20
        scale where 10 is average. For entertainment, not a stat block to live by.
      </p>
    </div>
  );
}
