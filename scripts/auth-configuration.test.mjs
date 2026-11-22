import assert from "node:assert/strict";
import test from "node:test";
import { authenticate } from "../server/middleware/auth.ts";

test("a missing server verification key does not mark a user's session expired", async () => {
  const names = ["CLERK_SECRET_KEY", "CLERK_JWT_KEY"];
  const previous = names.map((name) => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    await assert.rejects(authenticate(""), { status: 401 });
    await assert.rejects(authenticate("opaque-session-token"), {
      status: 503,
      message: "Sahva can’t verify sign-ins right now. Please try again later.",
    });
  } finally {
    names.forEach((name, i) => {
      if (previous[i] === undefined) delete process.env[name];
      else process.env[name] = previous[i];
    });
  }
});
