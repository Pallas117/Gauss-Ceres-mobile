import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  InsertFeedback,
  InsertOperatorSession,
  feedback,
  operatorSessions,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Feedback ────────────────────────────────────────────────────────────────

export async function saveFeedback(data: InsertFeedback): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(feedback).values(data);
  return (result as unknown as { insertId: number }).insertId;
}

export async function listFeedbackByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(feedback)
    .where(eq(feedback.userId, userId))
    .orderBy(desc(feedback.createdAt))
    .limit(50);
}

export async function listAllFeedback() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(feedback).orderBy(desc(feedback.createdAt)).limit(200);
}

export async function resolveFeedback(id: number, adminNote?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(feedback)
    .set({ isResolved: true, resolvedAt: new Date(), adminNote: adminNote ?? null })
    .where(eq(feedback.id, id));
}

// ─── Operator Sessions ───────────────────────────────────────────────────────

export async function startOperatorSession(data: InsertOperatorSession): Promise<number> {
  const db = await getDb();
  if (!db) return -1;
  const result = await db.insert(operatorSessions).values(data);
  return (result as unknown as { insertId: number }).insertId;
}

export async function endOperatorSession(
  id: number,
  stats: {
    eventsProcessed?: number;
    commandsSent?: number;
    dangerAcknowledged?: number;
    peakThreatPct?: number;
  },
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(operatorSessions)
    .set({ endedAt: new Date(), ...stats })
    .where(eq(operatorSessions.id, id));
}

export async function listSessionsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(operatorSessions)
    .where(eq(operatorSessions.userId, userId))
    .orderBy(desc(operatorSessions.startedAt))
    .limit(20);
}
