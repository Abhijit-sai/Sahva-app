import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { once } from "node:events";
import { setTimeout as wait } from "node:timers/promises";
import pg from "pg";
import WebSocket from "ws";

test("PostgreSQL-backed call lifecycle and multiple authenticated devices", async () => {
  const database = process.env.SAHVA_TEST_DATABASE_URL;
  assert.ok(
    database && new URL(database).pathname.endsWith("_test"),
    "Provide a disposable, migrated SAHVA_TEST_DATABASE_URL ending in _test.",
  );
  const pool = new pg.Pool({ connectionString: database });
  const port = Number(process.env.SAHVA_TEST_PORT || 3197),
    origin = "http://127.0.0.1:" + port;
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const internal = randomUUID();
  const child = spawn(process.execPath, ["dist-server/server.js"], {
    env: {
      ...process.env,
      DATABASE_URL: database,
      NODE_ENV: "production",
      PORT: String(port),
      PUBLIC_WEB_URL: origin,
      CLERK_JWT_KEY: publicKey.export({ format: "pem", type: "spki" }),
      INTERNAL_CALL_API_KEY: internal,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const sockets = [],
    users = [];
  async function user(name) {
    const clerkId = "user_" + randomUUID(),
      email = clerkId + "@example.test";
    const {
      rows: [row],
    } = await pool.query(
      "INSERT INTO users(clerk_user_id,email,display_name) VALUES($1,$2,$3) RETURNING id",
      [clerkId, email, name],
    );
    users.push(row.id);
    const now = Math.floor(Date.now() / 1000),
      json = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
    const data =
      json({
        alg: "RS256",
        typ: "JWT",
        kid: "local-test",
        cat: "cl_B7d4PD111AAA",
      }) +
      "." +
      json({
        iss: "https://fixture.clerk.accounts.dev",
        sid: "sess_" + randomUUID(),
        sub: clerkId,
        azp: origin,
        iat: now,
        nbf: now - 2,
        exp: now + 180,
      });
    return {
      ...row,
      email,
      token:
        data +
        "." +
        sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url"),
    };
  }
  async function api(path, actor, body, expected = 200, key = false) {
    const headers = { "Content-Type": "application/json" };
    if (actor) headers.Authorization = "Bearer " + actor.token;
    if (key) headers["x-internal-call-key"] = internal;
    const res = await fetch(origin + "/api" + path, {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const value = await res.json();
    assert.equal(res.status, expected, JSON.stringify(value));
    return value;
  }
  async function device(actor) {
    const ws = new WebSocket(origin.replace("http", "ws") + "/ws/user", [
      "sahva",
      "jwt." + actor.token,
    ]);
    sockets.push(ws);
    const events = [];
    ws.on("message", (d) => events.push(JSON.parse(String(d))));
    await once(ws, "open");
    return events;
  }
  async function event(events, type, id) {
    for (let i = 0; i < 60; i++) {
      if (events.some((e) => e.type === type && e.callSessionId === id)) return;
      await wait(50);
    }
    assert.fail("Missing " + type);
  }
  try {
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) throw Error("Server exited during startup");
      if (
        await fetch(origin + "/healthz")
          .then((r) => r.ok)
          .catch(() => false)
      )
        break;
      await wait(100);
    }
    const a = await user("Caller"),
      b = await user("Recipient"),
      outsider = await user("Observer");
    await api("/me", null, null, 401);
    assert.equal((await api("/me", b)).user.id, b.id);
    const [phone, web] = await Promise.all([device(b), device(b)]);
    const room = await api("/conversations", a, { targetUserIds: [b.id] }, 201);
    await api(
      "/conversations/" + room.roomKey + "/messages",
      outsider,
      null,
      404,
    );
    const ring = async (extra = {}) =>
      api(
        "/calls/ring",
        null,
        {
          conversationId: room.id,
          callerUserId: a.id,
          targetEmails: [b.email],
          ...extra,
        },
        200,
        true,
      );
    const first = await ring();
    assert.equal(first.deliveredToSockets, 2);
    await Promise.all([
      event(phone, "call:incoming", first.callSessionId),
      event(web, "call:incoming", first.callSessionId),
    ]);
    assert.equal(
      (await api("/calls/pending", b))[0].callSessionId,
      first.callSessionId,
    );
    await api("/calls/" + first.callSessionId + "/cancel", b, {}, 403);
    await api("/calls/" + first.callSessionId + "/answer", outsider, {}, 403);
    await api("/calls/" + first.callSessionId + "/decline", b, {});
    await event(phone, "call:declined", first.callSessionId);
    assert.deepEqual(await api("/calls/pending", b), []);
    const second = await ring();
    await api("/calls/" + second.callSessionId + "/cancel", a, {});
    await event(web, "call:cancelled", second.callSessionId);
    const third = await ring({ ringTimeoutSec: 1 });
    await event(phone, "call:missed", third.callSessionId);
    const fourth = await ring();
    const answer = () =>
      fetch(origin + "/api/calls/" + fourth.callSessionId + "/answer", {
        method: "POST",
        headers: { Authorization: "Bearer " + b.token },
      });
    const statuses = await Promise.all([answer(), answer()]);
    assert.deepEqual(statuses.map((r) => r.status).sort(), [200, 409]);
    await event(web, "call:answered_elsewhere", fourth.callSessionId);
    assert.equal((await api("/call-log", b)).length, 4);
  } finally {
    for (const ws of sockets) ws.terminate();
    child.kill();
    await pool.end();
  }
});
