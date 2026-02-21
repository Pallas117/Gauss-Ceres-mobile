import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { notifyOwner } from "./_core/notification";
import * as db from "./db";

// ─── Feedback router ─────────────────────────────────────────────────────────

const feedbackRouter = router({
  /**
   * Submit feedback. Requires authentication.
   * Also sends an owner notification for HIGH/CRITICAL severity items.
   */
  submit: protectedProcedure
    .input(
      z.object({
        category: z.enum(["BUG", "FEATURE", "DATA", "OTHER"]),
        severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
        message: z.string().min(10, "Message must be at least 10 characters").max(2000),
        contextRef: z.string().max(128).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const id = await db.saveFeedback({
        userId: ctx.user.id,
        category: input.category,
        severity: input.severity,
        message: input.message,
        contextRef: input.contextRef ?? null,
      });

      // Notify owner for high-priority feedback
      if (input.severity === "HIGH" || input.severity === "CRITICAL") {
        await notifyOwner({
          title: `[GAUSS HUD] ${input.severity} ${input.category} feedback`,
          content: `From: ${ctx.user.name ?? ctx.user.email ?? "Unknown operator"}\n\n${input.message}`,
        }).catch(() => {
          // Non-fatal — feedback is already saved
        });
      }

      return { id, success: true };
    }),

  /** List the authenticated user's own feedback submissions */
  myList: protectedProcedure.query(({ ctx }) => {
    return db.listFeedbackByUser(ctx.user.id);
  }),

  /** Admin-only: list all feedback */
  adminList: protectedProcedure.query(({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new Error("Forbidden: admin only");
    }
    return db.listAllFeedback();
  }),

  /** Admin-only: mark feedback as resolved */
  resolve: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        adminNote: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new Error("Forbidden: admin only");
      }
      await db.resolveFeedback(input.id, input.adminNote);
      return { success: true };
    }),
});

// ─── Operator sessions router ─────────────────────────────────────────────────

const sessionsRouter = router({
  /** Start a new operator session when the HUD loads */
  start: protectedProcedure
    .input(
      z.object({
        nodeId: z.string().max(64).default("JUDITH-M1"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const id = await db.startOperatorSession({
        userId: ctx.user.id,
        nodeId: input.nodeId,
      });
      return { sessionId: id };
    }),

  /** End a session with final stats */
  end: protectedProcedure
    .input(
      z.object({
        sessionId: z.number(),
        eventsProcessed: z.number().int().min(0).default(0),
        commandsSent: z.number().int().min(0).default(0),
        dangerAcknowledged: z.number().int().min(0).default(0),
        peakThreatPct: z.number().int().min(0).max(100).default(0),
      }),
    )
    .mutation(async ({ input }) => {
      await db.endOperatorSession(input.sessionId, {
        eventsProcessed: input.eventsProcessed,
        commandsSent: input.commandsSent,
        dangerAcknowledged: input.dangerAcknowledged,
        peakThreatPct: input.peakThreatPct,
      });
      return { success: true };
    }),

  /** List the authenticated user's recent sessions */
  myList: protectedProcedure.query(({ ctx }) => {
    return db.listSessionsByUser(ctx.user.id);
  }),
});

// ─── Root router ──────────────────────────────────────────────────────────────

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts
  // all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  feedback: feedbackRouter,
  sessions: sessionsRouter,
});

export type AppRouter = typeof appRouter;
