import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Feedback submitted by operators via the Feedback Portal.
 */
export const feedback = mysqlTable("feedback", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  category: mysqlEnum("category", ["BUG", "FEATURE", "DATA", "OTHER"]).notNull(),
  severity: mysqlEnum("severity", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM").notNull(),
  message: text("message").notNull(),
  /** Optional context: satellite NORAD ID or event ID this feedback relates to */
  contextRef: varchar("contextRef", { length: 128 }),
  isResolved: boolean("isResolved").default(false).notNull(),
  resolvedAt: timestamp("resolvedAt"),
  adminNote: text("adminNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Feedback = typeof feedback.$inferSelect;
export type InsertFeedback = typeof feedback.$inferInsert;

/**
 * HUD operator sessions — tracks when each user was active in the HUD.
 * Used for audit trail and usage analytics.
 */
export const operatorSessions = mysqlTable("operator_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  nodeId: varchar("nodeId", { length: 64 }).default("JUDITH-M1").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  endedAt: timestamp("endedAt"),
  /** Number of telemetry events processed during this session */
  eventsProcessed: int("eventsProcessed").default(0).notNull(),
  /** Number of commands sent to the M1 node */
  commandsSent: int("commandsSent").default(0).notNull(),
  /** Number of danger flashes acknowledged */
  dangerAcknowledged: int("dangerAcknowledged").default(0).notNull(),
  /** Highest threat % seen during session */
  peakThreatPct: int("peakThreatPct").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OperatorSession = typeof operatorSessions.$inferSelect;
export type InsertOperatorSession = typeof operatorSessions.$inferInsert;
