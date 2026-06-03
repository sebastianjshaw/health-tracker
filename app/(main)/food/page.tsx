import { PageHeader } from "@/components/PageHeader";
import { FoodManager } from "@/components/food/FoodManager";
import { getFoods, getRecurring } from "@/lib/food-data";

export default async function FoodPage() {
  const [foods, recurring] = await Promise.all([getFoods(), getRecurring()]);

  return (
    <>
      <PageHeader title="Food" subtitle="Your library and recurring defaults" />
      <FoodManager foods={foods} recurring={recurring} />
    </>
  );
}
