import { verifyToken, clerkClient } from "@clerk/express";
import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler, Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { users, type User } from "../../src/db/schema";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const route =
  (
    handler: (
      req: Request,
      res: Response,
      next: NextFunction,
    ) => Promise<unknown>,
  ): RequestHandler =>
  (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
export const origins = () =>
  [
    process.env.PUBLIC_WEB_URL,
    "https://localhost",
    ...(process.env.NODE_ENV === "production"
      ? []
      : ["http://localhost:3000", "http://127.0.0.1:3000"]),
  ]
    .filter(Boolean)
    .map((value) => new URL(value!).origin);
export async function authenticate(token: string) {
  if (!token) throw new HttpError(401, "Sign in to Sahva.");
  const secretKey = process.env.CLERK_SECRET_KEY;
  const jwtKey = process.env.CLERK_JWT_KEY;
  const unavailable = "Sahva can’t verify sign-ins right now. Please try again later.";
  if (!secretKey && !jwtKey) throw new HttpError(503, unavailable);
  const claims = await verifyToken(token, {
    secretKey,
    jwtKey,
    authorizedParties: origins(),
  }).catch((error) => {
    if (["secret-key-invalid", "jwk-local-missing", "jwk-remote-failed-to-load", "jwk-remote-invalid"].includes(error?.reason))
      throw new HttpError(503, unavailable);
    if (error?.reason === "token-expired")
      throw new HttpError(401, "Your session has expired. Please sign in again.");
    throw new HttpError(401, "Your session could not be verified. Please sign in again.");
  });
  if (!claims.sub || !claims.sid)
    throw new HttpError(401, "A user session is required.");
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, claims.sub));
  if (existing) {
    if (Date.now() - existing.lastSeenAt.getTime() > 60000)
      await db
        .update(users)
        .set({ lastSeenAt: new Date() })
        .where(eq(users.id, existing.id));
    return existing;
  }
  if (!secretKey) throw new HttpError(503, unavailable);
  const account = await clerkClient.users.getUser(claims.sub);
  const primary = account.emailAddresses.find(
    (e) =>
      e.id === account.primaryEmailAddressId &&
      e.verification?.status === "verified",
  );
  if (!primary) throw new HttpError(403, "Verify your email address in Clerk.");
  const [user] = await db
    .insert(users)
    .values({
      clerkUserId: account.id,
      email: primary.emailAddress.toLowerCase(),
      displayName:
        [account.firstName, account.lastName].filter(Boolean).join(" ") ||
        primary.emailAddress.split("@")[0],
    })
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: { lastSeenAt: new Date() },
    })
    .returning();
  return user;
}
export const auth = route(async (req, res, next) => {
  const key = process.env.INTERNAL_CALL_API_KEY;
  const hash = (s: string) => createHash("sha256").update(s).digest();
  if (
    req.method === "POST" &&
    req.path === "/calls/ring" &&
    key &&
    timingSafeEqual(hash(req.get("x-internal-call-key") || ""), hash(key))
  ) {
    res.locals.internal = true;
  } else {
    res.locals.user = await authenticate(
      req.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1] || "",
    );
  }
  next();
});
export const currentUser = (res: Response): User => res.locals.user;
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)
  )
    throw new HttpError(400, "Invalid identifier.");
  return value;
}
