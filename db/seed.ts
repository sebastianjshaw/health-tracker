import "dotenv/config";
import { db } from "./index";
import { foods, recurringFoods } from "./schema";

async function main() {
  const sample = [
    { name: "Whole egg", servingSize: 50, servingUnit: "g", kcal: 72, protein: 6.3, carbs: 0.4, fat: 5 },
    { name: "Rye bread", brand: "Wasa", servingSize: 30, servingUnit: "g", kcal: 80, protein: 2.5, carbs: 14, fat: 1 },
    { name: "Oat milk", brand: "Oatly", servingSize: 100, servingUnit: "ml", kcal: 46, protein: 1, carbs: 6.6, fat: 1.5 },
    { name: "Chicken breast", servingSize: 100, servingUnit: "g", kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
    { name: "Banana", servingSize: 120, servingUnit: "g", kcal: 105, protein: 1.3, carbs: 27, fat: 0.4 },
    { name: "Whey protein shake", servingSize: 30, servingUnit: "g", kcal: 113, protein: 24, carbs: 2, fat: 1.5 },
    { name: "Skyr natural", brand: "Arla", servingSize: 150, servingUnit: "g", kcal: 96, protein: 17, carbs: 6, fat: 0.3 },
  ];

  const inserted = await db.insert(foods).values(sample).returning();
  const byName = (n: string) => inserted.find((f) => f.name === n)!;

  await db.insert(recurringFoods).values([
    { foodId: byName("Whey protein shake").id, meal: "breakfast", schedule: "weekday", quantity: 1 },
    { foodId: byName("Skyr natural").id, meal: "breakfast", schedule: "everyday", quantity: 1 },
    { foodId: byName("Banana").id, meal: "snacks", schedule: "weekend", quantity: 1 },
  ]);

  console.log(`Seeded ${inserted.length} foods and 3 recurring defaults.`);
}

main().then(() => process.exit(0));
