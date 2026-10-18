import { PageHeader } from "@/components/PageHeader";
import { FoodManager } from "@/components/food/FoodManager";
import { MealManager } from "@/components/food/MealManager";
import { getFoods, getRecurring } from "@/lib/food-data";
import { getMeals } from "@/lib/meal-data";

export default async function FoodPage() {
  const [foods, recurring, meals] = await Promise.all([getFoods(), getRecurring(), getMeals()]);

  return (
    <>
      <PageHeader title="Food" subtitle="Your library, meals and recurring defaults" />
      <div className="mb-4">
        <MealManager meals={meals} />
      </div>
      <FoodManager foods={foods} recurring={recurring} />
    </>
  );
}
