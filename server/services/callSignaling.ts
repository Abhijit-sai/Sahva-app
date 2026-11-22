import { Router } from "express";
import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "../../src/db";
import {
  users,
  calls,
  conversations,
  rings,
  type User,
} from "../../src/db/schema";
import { currentUser, HttpError, route, uuid } from "../middleware/auth";
import { avatar, members, membership } from "./repository";
import { createRoom } from "../api";

const sockets = new Map<string, Map<WebSocket, number>>();
const openStatuses = ["ringing", "delivered"] as const;
const openRing = () => inArray(rings.status, [...openStatuses]);
export function sendUser(id: string, payload: object) {
  let count = 0;
  for (const ws of sockets.get(id)?.keys() || [])
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      count++;
    }
  return count;
}
export function attachUserSocket(user: User, ws: WebSocket) {
  const group = sockets.get(user.id) || new Map<WebSocket, number>();
  sockets.set(user.id, group);
  group.set(ws, Date.now());
  ws.on("pong", () => group.set(ws, Date.now()));
  ws.on("error", () => ws.terminate());
  ws.on("close", () => {
    group.delete(ws);
    if (!group.size) sockets.delete(user.id);
  });
  void pending(user.id)
    .then((events) => {
      for (const event of events)
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
    })
    .catch(() => ws.close(1011));
}
async function incoming(
  c: typeof calls.$inferSelect,
  caller: User,
  roomKey: string,
) {
  return {
    type: "call:incoming",
    callSessionId: c.id,
    roomId: c.roomId,
    conversationId: c.conversationId,
    roomKey,
    caller: {
      id: caller.id,
      name: caller.displayName,
      avatarUrl: await avatar(caller.avatarUrl),
      languageCode: caller.preferredLanguageCode,
      languageName: caller.preferredLanguageName,
      voiceTone: caller.voiceTone,
    },
    ringTimeoutSec: Math.ceil((+c.expiresAt - +c.createdAt) / 1000),
    issuedAt: c.createdAt,
    expiresAt: c.expiresAt,
  };
}
async function pending(userId: string) {
  const rows = await db
    .select({ c: calls, caller: users, room: conversations.roomKey })
    .from(rings)
    .innerJoin(calls, eq(calls.id, rings.callSessionId))
    .innerJoin(users, eq(users.id, calls.initiatorUserId))
    .innerJoin(conversations, eq(conversations.id, calls.conversationId))
    .where(
      and(
        eq(rings.targetUserId, userId),
        openRing(),
        gt(calls.expiresAt, new Date()),
        inArray(calls.status, ["ringing", "active"]),
      ),
    );
  return Promise.all(rows.map((r) => incoming(r.c, r.caller, r.room)));
}
async function expire() {
  const expired = await db.transaction(async (tx) => {
    const stale = await tx
      .select({ id: calls.id, caller: calls.initiatorUserId })
      .from(calls)
      .where(
        and(
          lte(calls.expiresAt, new Date()),
          inArray(calls.status, ["ringing", "active"]),
          sql`exists (select 1 from ${rings} where ${rings.callSessionId}=${calls.id} and ${openRing()})`,
        ),
      )
      .for("update", { skipLocked: true });
    const events = [];
    for (const c of stale) {
      const targets = await tx
        .update(rings)
        .set({ status: "missed", updatedAt: new Date() })
        .where(and(eq(rings.callSessionId, c.id), openRing()))
        .returning({ id: rings.targetUserId });
      const ended = await tx
        .update(calls)
        .set({ status: "missed", endedAt: new Date() })
        .where(and(eq(calls.id, c.id), eq(calls.status, "ringing")))
        .returning();
      events.push({
        id: c.id,
        to: [...targets.map((t) => t.id), ...(ended.length ? [c.caller] : [])],
      });
    }
    return events;
  });
  for (const e of expired)
    for (const id of e.to)
      sendUser(id, { type: "call:missed", callSessionId: e.id });
}
export function startSignaling() {
  setInterval(() => {
    for (const group of sockets.values())
      for (const ws of group.keys())
        if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, 20000).unref();
  setInterval(() => {
    for (const group of sockets.values())
      for (const [ws, seen] of group)
        if (Date.now() - seen >= 45000) ws.terminate();
  }, 1000).unref();
  let busy = false;
  setInterval(() => {
    if (!busy) {
      busy = true;
      void expire()
        .catch((e) => console.error("Ring expiry failed", e.code))
        .finally(() => (busy = false));
    }
  }, 1000).unref();
}
export const signalApi = Router();
signalApi.get(
  "/pending",
  route(async (_req, res) => {
    res.json(await pending(currentUser(res).id));
  }),
);
signalApi.post(
  "/ring",
  route(async (req, res) => {
    const b = req.body;
    let caller: User = currentUser(res);
    if (res.locals.internal) {
      if (b.callerUserId || process.env.INTERNAL_CALLER_USER_ID) {
        [caller] = await db
          .select()
          .from(users)
          .where(
            eq(
              users.id,
              uuid(b.callerUserId || process.env.INTERNAL_CALLER_USER_ID),
            ),
          );
      } else {
        [caller] = await db
          .insert(users)
          .values({
            clerkUserId: "internal:caller",
            email: "call-service@sahva.invalid",
            displayName: "Sahva Call Service",
          })
          .onConflictDoUpdate({
            target: users.clerkUserId,
            set: { lastSeenAt: new Date() },
          })
          .returning();
      }
      if (!caller) throw new HttpError(404, "Caller unavailable.");
    }
    const ids = [
      ...new Set<string>(
        (b.targetUserIds || [b.targetUserId].filter(Boolean)).map(uuid),
      ),
    ];
    const emails = [
      ...new Set<string>(
        (b.targetEmails || [b.targetEmail].filter(Boolean)).map((s: string) =>
          String(s).toLowerCase().trim(),
        ),
      ),
    ];
    if (ids.length + emails.length > 24)
      throw new HttpError(400, "Too many recipients.");
    let targets = await db
      .select()
      .from(users)
      .where(or(inArray(users.id, ids), inArray(users.email, emails)));
    if (
      ids.some((id) => !targets.some((u) => u.id === id)) ||
      emails.some((e) => !targets.some((u) => u.email === e))
    )
      throw new HttpError(404, "Recipient unavailable.");
    let room;
    if (b.conversationId) {
      [room] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, uuid(b.conversationId)));
      if (!room) throw new HttpError(404, "Conversation unavailable.");
      await membership(caller.id, room.roomKey);
      const team = await members(room.id);
      if (targets.some((u) => !team.some((t) => t.id === u.id)))
        throw new HttpError(403, "Recipient is outside this conversation.");
      if (!targets.length) targets = team;
    }
    targets = targets.filter((u) => u.id !== caller.id);
    if (!targets.length)
      throw new HttpError(400, "Choose at least one other Sahva user.");
    room ??= await createRoom(
      caller.id,
      targets.map((u) => u.id),
    );
    const roomId = b.roomId === undefined ? randomUUID() : String(b.roomId);
    if (!/^[\w-]{1,100}$/.test(roomId))
      throw new HttpError(400, "Invalid room ID.");
    const timeout = b.ringTimeoutSec ?? 45;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 45)
      throw new HttpError(400, "Ring timeout must be 1–45 seconds.");
    const c = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${room.id},0))`,
      );
      const [existing] = await tx
        .select()
        .from(calls)
        .where(
          or(
            eq(calls.roomId, roomId),
            and(
              eq(calls.conversationId, room.id),
              inArray(calls.status, ["ringing", "active"]),
            ),
          ),
        );
      if (
        existing &&
        (existing.roomId !== roomId ||
          existing.conversationId !== room.id ||
          existing.initiatorUserId !== caller.id ||
          existing.status !== "ringing" ||
          +existing.expiresAt <= Date.now())
      )
        throw new HttpError(409, "Call already in progress or finished.");
      const call =
        existing ||
        (
          await tx
            .insert(calls)
            .values({
              roomId,
              conversationId: room.id,
              initiatorUserId: caller.id,
              expiresAt: new Date(Date.now() + timeout * 1000),
              participantSnapshotJson: [caller, ...targets].map((u) => ({
                id: u.id,
                name: u.displayName,
                language: u.preferredLanguageName,
              })),
            })
            .returning()
        )[0];
      await tx
        .insert(rings)
        .values(
          targets.map((u) => ({
            callSessionId: call.id,
            callerUserId: caller.id,
            targetUserId: u.id,
            triggeredVia: res.locals.internal
              ? ("internal_api" as const)
              : ("app" as const),
          })),
        )
        .onConflictDoNothing();
      return call;
    });
    const event = await incoming(c, caller, room.roomKey);
    const online: string[] = [],
      offline: string[] = [];
    let delivered = 0;
    const live = await db
      .select()
      .from(rings)
      .where(and(eq(rings.callSessionId, c.id), openRing()));
    for (const target of targets) {
      if (!live.some((r) => r.targetUserId === target.id)) continue;
      const count = sendUser(target.id, event);
      delivered += count;
      (count ? online : offline).push(target.id);
    }
    if (online.length)
      await db
        .update(rings)
        .set({ status: "delivered", updatedAt: new Date() })
        .where(
          and(
            eq(rings.callSessionId, c.id),
            eq(rings.status, "ringing"),
            inArray(rings.targetUserId, online),
          ),
        );
    res.json({
      callSessionId: c.id,
      roomId: c.roomId,
      roomKey: room.roomKey,
      deliveredToSockets: delivered,
      onlineTargetUserIds: online,
      offlineTargetUserIds: offline,
    });
  }),
);
signalApi.post(
  "/:id/:action(answer|decline|cancel)",
  route(async (req, res) => {
    const id = uuid(req.params.id),
      action = req.params.action,
      u = currentUser(res);
    const change = await db.transaction(async (tx) => {
      const [c] = await tx
        .select()
        .from(calls)
        .where(eq(calls.id, id))
        .for("update");
      if (!c) throw new HttpError(404, "Call unavailable.");
      const events = await tx
        .select()
        .from(rings)
        .where(eq(rings.callSessionId, id));
      const own = events.find((e) => e.targetUserId === u.id);
      if (action === "cancel" ? c.initiatorUserId !== u.id : !own)
        throw new HttpError(403, "Call unavailable.");
      if (
        (action === "cancel" &&
          events.every((e) => e.status === "cancelled")) ||
        (action === "decline" && own?.status === "declined")
      )
        return { to: [], caller: c.initiatorUserId };
      if (
        +c.expiresAt <= Date.now() ||
        !["active", "ringing"].includes(c.status)
      )
        throw new HttpError(409, "Call has ended.");
      if (action === "cancel") {
        if (c.status !== "ringing")
          throw new HttpError(409, "Call already answered.");
        await tx
          .update(calls)
          .set({ status: "ended", endedAt: new Date() })
          .where(eq(calls.id, id));
        await tx
          .update(rings)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(and(eq(rings.callSessionId, id), openRing()));
        return {
          to: events.map((e) => e.targetUserId),
          caller: c.initiatorUserId,
        };
      }
      if (!["ringing", "delivered"].includes(own!.status))
        throw new HttpError(409, "Call already handled.");
      await tx
        .update(rings)
        .set({
          status: action === "answer" ? "answered" : "declined",
          updatedAt: new Date(),
        })
        .where(eq(rings.id, own!.id));
      const last = events.every(
        (e) =>
          e.id === own!.id ||
          ["declined", "missed", "cancelled"].includes(e.status),
      );
      if (action === "answer")
        await tx
          .update(calls)
          .set({ status: "active", connectedAt: c.connectedAt || new Date() })
          .where(eq(calls.id, id));
      else if (last)
        await tx
          .update(calls)
          .set({ status: "declined", endedAt: new Date() })
          .where(eq(calls.id, id));
      return {
        to: [u.id],
        caller: c.initiatorUserId,
        partial: action === "decline" && !last,
      };
    });
    const type =
      action === "answer"
        ? "call:answered_elsewhere"
        : action === "cancel"
          ? "call:cancelled"
          : "call:declined";
    for (const uid of change.to) sendUser(uid, { type, callSessionId: id });
    sendUser(change.caller, {
      type: action === "answer" ? "call:answered" : type,
      partial: change.partial,
      callSessionId: id,
    });
    res.json({ ok: true });
  }),
);
