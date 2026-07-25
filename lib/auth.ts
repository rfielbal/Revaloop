export type DeveloperIdentity = {
  displayName: string;
  email: string;
};

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function localIdentity(request: Request): DeveloperIdentity | null {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const hostname = new URL(request.url).hostname;

  if (
    hostname !== "localhost" &&
    hostname !== "127.0.0.1" &&
    hostname !== "::1"
  ) {
    return null;
  }

  return {
    displayName: "Raphaël",
    email: "raphael@revaloop.local",
  };
}

export function developerIdentityFromRequest(
  request: Request,
): DeveloperIdentity | null {
  const email = request.headers.get(USER_EMAIL_HEADER)?.trim().toLowerCase();

  if (!email) {
    return localIdentity(request);
  }

  const encodedName = request.headers.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedName &&
    request.headers.get(USER_FULL_NAME_ENCODING_HEADER) ===
      "percent-encoded-utf-8"
      ? safeDecode(encodedName)
      : null;

  return {
    displayName: fullName?.trim() || email,
    email,
  };
}

export function unauthorizedResponse() {
  return Response.json(
    { error: "Authentification développeur requise." },
    {
      status: 401,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}
