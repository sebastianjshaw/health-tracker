import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { cardioSessions, liftSessions, liftSets } from "@/db/schema";
import {
  Exercise,
  SETS_FOR,
  WORKOUTS,
} from "./constants";
import { getLiftWeights, getNextWorkout } from "./settings";

export async function getRecentCardio(limit = 15) {
  return db
    .select()
    .from(cardioSessions)
    .orderBy(desc(cardioSessions.date), desc(cardioSessions.id))
    .limit(limit)
    .all();
}

export type NextLiftWorkout = {
  workout: "A" | "B";
  exercises: { exercise: Exercise; targetWeightKg: number; sets: number }[];
};

export async function getNextLiftWorkout(): Promise<NextLiftWorkout> {
  const [workout, weights] = await Promise.all([getNextWorkout(), getLiftWeights()]);
  const exercises = WORKOUTS[workout].map((exercise) => ({
    exercise,
    targetWeightKg: weights[exercise],
    sets: SETS_FOR[exercise],
  }));
  return { workout, exercises };
}

export type LiftHistoryEntry = {
  id: number;
  date: string;
  workout: string;
  sets: { exercise: Exercise; targetWeightKg: number; repsDone: number | null }[];
};

export async function getRecentLiftSessions(limit = 8): Promise<LiftHistoryEntry[]> {
  const sessions = await db
    .select()
    .from(liftSessions)
    .orderBy(desc(liftSessions.date), desc(liftSessions.id))
    .limit(limit)
    .all();

  if (sessions.length === 0) return [];

  const ids = sessions.map((s) => s.id);
  const sets = await db
    .select()
    .from(liftSets)
    .where(inArray(liftSets.sessionId, ids))
    .all();

  return sessions.map((s) => ({
    id: s.id,
    date: s.date,
    workout: s.workout,
    sets: sets
      .filter((st) => st.sessionId === s.id)
      .map((st) => ({
        exercise: st.exercise as Exercise,
        targetWeightKg: st.targetWeightKg,
        repsDone: st.repsDone,
      })),
  }));
}
