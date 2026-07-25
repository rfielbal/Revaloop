import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  countDeveloperCredentials,
  createDeveloperSession,
  getDeveloperCredential,
  getDeveloperIdentityBySessionHash,
  registerDeveloperCredential,
  revokeDeveloperSession,
} from "../db/repository";
import type { DeveloperIdentity } from "./auth";
import {
  DEVELOPER_PASSWORD_MAX_LENGTH,
  DEVELOPER_SESSION_DURATION_SECONDS,
  DeveloperAuthError,
  developerLoginPath,
  developerSessionCookieName,
  hashDeveloperPassword,
  normalizeDeveloperEmail,
  performDummyDeveloperPasswordCheck,
  validateDeveloperPassword,
  verifyDeveloperPassword,
} from "./developer-auth-core";
import { generateSecret, parseCookies, sha256 } from "./security";

const LOGIN_ERROR = "Adresse e-mail ou mot de passe incorrect.";
export * from "./developer-auth-core";

export async function developerRegistrationIsOpen() {
  if (process.env.REVALOOP_ALLOW_REGISTRATION === "true") {
    return true;
  }

  return (await countDeveloperCredentials()) === 0;
}

async function issueDeveloperSession(userId: string) {
  const token = generateSecret();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(
    Date.now() + DEVELOPER_SESSION_DURATION_SECONDS * 1_000,
  ).toISOString();

  await createDeveloperSession({ userId, tokenHash, expiresAt });

  return { token, expiresAt };
}

export async function registerDeveloper(input: {
  displayName: string;
  email: string;
  password: string;
}) {
  if (!(await developerRegistrationIsOpen())) {
    throw new DeveloperAuthError(
      "Cette instance est déjà initialisée. Les nouvelles inscriptions sont fermées.",
      403,
    );
  }

  const displayName = input.displayName
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, 80);
  const email = normalizeDeveloperEmail(input.email);

  if (displayName.length < 2) {
    throw new DeveloperAuthError("Le nom affiché doit contenir au moins 2 caractères.");
  }

  if (!email) {
    throw new DeveloperAuthError("L’adresse e-mail n’est pas valide.");
  }

  const password = validateDeveloperPassword(input.password);
  const passwordRecord = await hashDeveloperPassword(password);
  const identity = await registerDeveloperCredential({
    email,
    displayName,
    ...passwordRecord,
    allowAdditional: process.env.REVALOOP_ALLOW_REGISTRATION === "true",
  });
  const credential = await getDeveloperCredential(identity.email);

  if (!credential) {
    throw new Error("Le compte a été créé sans identifiant exploitable.");
  }

  const session = await issueDeveloperSession(credential.userId);
  return { identity, ...session };
}

export async function loginDeveloper(input: {
  email: string;
  password: string;
}) {
  const email = normalizeDeveloperEmail(input.email);
  const password =
    typeof input.password === "string" &&
    Array.from(input.password).length <= DEVELOPER_PASSWORD_MAX_LENGTH
      ? input.password
      : "";
  const credential = email ? await getDeveloperCredential(email) : null;

  if (!credential) {
    await performDummyDeveloperPasswordCheck(password);
    throw new DeveloperAuthError(LOGIN_ERROR, 401);
  }

  const valid = await verifyDeveloperPassword(password, credential);

  if (!valid) {
    throw new DeveloperAuthError(LOGIN_ERROR, 401);
  }

  const session = await issueDeveloperSession(credential.userId);
  return {
    identity: {
      displayName: credential.displayName,
      email: credential.email,
    } satisfies DeveloperIdentity,
    ...session,
  };
}

async function identityFromToken(token: string | null | undefined) {
  if (!token || token.length > 128) {
    return null;
  }

  return getDeveloperIdentityBySessionHash(await sha256(token));
}

export async function developerIdentityFromRequest(request: Request) {
  const requestCookies = parseCookies(request);
  const token = requestCookies.get(developerSessionCookieName());

  return identityFromToken(token);
}

export async function getDeveloperIdentity() {
  const cookieStore = await cookies();
  const token = cookieStore.get(developerSessionCookieName())?.value;

  return identityFromToken(token);
}

export async function requireDeveloperIdentity(returnTo: string) {
  const identity = await getDeveloperIdentity();

  if (!identity) {
    redirect(developerLoginPath(returnTo));
  }

  return identity;
}

export async function revokeDeveloperRequestSession(request: Request) {
  const requestCookies = parseCookies(request);
  const token = requestCookies.get(developerSessionCookieName());

  if (token && token.length <= 128) {
    await revokeDeveloperSession(await sha256(token));
  }
}

export function developerAuthErrorResponse(error: unknown) {
  if (!(error instanceof DeveloperAuthError)) {
    return null;
  }

  return Response.json(
    { error: error.message },
    {
      status: error.status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
