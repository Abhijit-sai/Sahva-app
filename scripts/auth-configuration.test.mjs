import assert from "node:assert/strict";
import test from "node:test";
import { ClerkAPIResponseError } from "@clerk/react/errors";
import { requiresSignUpTransfer } from "../src/lib/signUpTransfer.ts";
import { authenticate } from "../server/middleware/auth.ts";

test("only an explicit Clerk transfer response starts signup after email verification", () => {
  const response = code => new ClerkAPIResponseError("Verification", {
    status: 422, data: [{ code, message: "Verification" }],
  });
  assert.equal(requiresSignUpTransfer(response("sign_up_if_missing_transfer")), true);
  assert.equal(requiresSignUpTransfer({ code: "sign_up_if_missing_transfer" }), true);
  assert.equal(requiresSignUpTransfer(response("form_code_incorrect")), false);
  assert.equal(requiresSignUpTransfer(null), false);
});

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
