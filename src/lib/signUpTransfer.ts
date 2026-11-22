import { isClerkAPIResponseError } from "@clerk/react/errors";

export function requiresSignUpTransfer(error: { code: string } | null) {
  if (!error) return false;
  const code = "sign_up_if_missing_transfer";
  return error.code === code ||
    (isClerkAPIResponseError(error) && error.errors.some(entry => entry.code === code));
}
