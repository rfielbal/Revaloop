export type DeveloperIdentity = {
  displayName: string;
  email: string;
};

export { developerIdentityFromRequest } from "./developer-auth";

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
