import {
  createHmac,
  timingSafeEqual,
  randomBytes,
  createCipheriv,
} from "node:crypto";
import { clerkClient, verifyToken } from "@clerk/express";
import type { Express } from "express";
import { route, currentUser, HttpError, origins } from "./middleware/auth";
const mac = (text: string) =>
  createHmac("sha256", process.env.CLERK_SECRET_KEY!)
    .update("sahva-listener-v1:" + text)
    .digest("base64url");
export function nativeAuth(app: Express) {
  app.post(
    "/api/native/handoff",
    route(async (req, res) => {
      const key = req.body.publicKey;
      if (key?.kty !== "RSA" || key.n?.length !== 342 || key.e !== "AQAB")
        throw new HttpError(400, "Invalid device key.");
      const ticket = await clerkClient.signInTokens.createSignInToken({
        userId: currentUser(res).clerkUserId,
        expiresInSeconds: 60,
      });
      const { createPublicKey, publicEncrypt, constants } =
        await import("node:crypto");
      const keyBytes = randomBytes(32),
        iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", keyBytes, iv);
      const data = Buffer.concat([
        cipher.update(ticket.token, "utf8"),
        cipher.final(),
        cipher.getAuthTag(),
      ]);
      const encrypted = publicEncrypt(
        {
          key: createPublicKey({
            key: { kty: "RSA", n: key.n, e: key.e },
            format: "jwk",
          }),
          oaepHash: "sha256",
          padding: constants.RSA_PKCS1_OAEP_PADDING,
        },
        keyBytes,
      );
      res
        .set("Cache-Control", "no-store")
        .json({
          code: [encrypted, iv, data]
            .map((b) => b.toString("base64url"))
            .join("."),
        });
    }),
  );
  app.post(
    "/api/native/listener-grant",
    route(async (req, res) => {
      const claims = await verifyToken(req.get("authorization")!.slice(7), {
        secretKey: process.env.CLERK_SECRET_KEY,
        authorizedParties: origins(),
      });
      const body = Buffer.from(
        JSON.stringify({
          sid: claims.sid,
          sub: claims.sub,
          exp: Date.now() + 7 * 86400000,
        }),
      ).toString("base64url");
      res
        .set("Cache-Control", "no-store")
        .json({ grant: body + "." + mac(body) });
    }),
  );
  app.post(
    "/native/listener-token",
    route(async (req, res) => {
      const [body, sig] = String(req.get("authorization") || "")
        .replace(/^Bearer /, "")
        .split(".");
      const expected = Buffer.from(mac(body));
      if (
        !sig ||
        sig.length !== expected.length ||
        !timingSafeEqual(Buffer.from(sig), expected)
      )
        throw new HttpError(401, "Listener expired.");
      const grant = JSON.parse(Buffer.from(body, "base64url").toString());
      if (grant.exp < Date.now())
        throw new HttpError(401, "Open Sahva to reconnect.");
      const session = await clerkClient.sessions.getSession(grant.sid);
      if (session.userId !== grant.sub || session.status !== "active")
        throw new HttpError(401, "Session ended.");
      const token = await clerkClient.sessions.getToken(session.id);
      res.set("Cache-Control", "no-store").json({ authToken: token.jwt });
    }),
  );
}
