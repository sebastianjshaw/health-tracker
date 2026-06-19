import { PageHeader } from "@/components/PageHeader";
import { CharacterSheet } from "@/components/character/CharacterSheet";
import { getCharacterSheet } from "@/lib/character-data";

export default async function CharacterPage() {
  const { character, name } = await getCharacterSheet();
  return (
    <div className="space-y-4">
      <PageHeader title="Character Sheet" subtitle="Your stats, rolled into a class" />
      <CharacterSheet character={character} name={name} />
    </div>
  );
}
