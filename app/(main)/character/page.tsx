import { PageHeader } from "@/components/PageHeader";
import { CharacterSheet } from "@/components/character/CharacterSheet";
import { YearSelect } from "@/components/character/YearSelect";
import { getCharacterSheet } from "@/lib/character-data";

export default async function CharacterPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year: yearParam } = await searchParams;
  const parsed = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;
  const { character, name, bodyComp, lifts, year, years } = await getCharacterSheet({ year: parsed });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Character Sheet"
        subtitle={year != null ? `${year} average` : "Your stats, rolled into a class"}
        action={<YearSelect year={year} years={years} />}
      />
      <CharacterSheet character={character} name={name} bodyComp={bodyComp} lifts={lifts} />
    </div>
  );
}
