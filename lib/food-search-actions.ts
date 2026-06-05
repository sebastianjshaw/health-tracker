"use server";

import { desc, like, or } from "drizzle-orm";
import { db } from "@/db";
import { foods } from "@/db/schema";
import type { Food } from "@/db/schema";
import { requireAuth } from "./auth";

const LIMIT = 50;

/** Search the food library (used by the Today "Add food" sheet). */
export async function searchFoods(query = ""): Promise<Food[]> {
  await requireAuth();
  const term = query.trim();
  if (!term) {
    return db.select().from(foods).orderBy(desc(foods.createdAt)).limit(LIMIT).all();
  }
  const pattern = `%${term}%`;
  return db
    .select()
    .from(foods)
    .where(or(like(foods.name, pattern), like(foods.brand, pattern)))
    .orderBy(desc(foods.createdAt))
    .limit(LIMIT)
    .all();
}
