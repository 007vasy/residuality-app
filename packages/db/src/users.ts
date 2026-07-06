import type { User } from "@stressforge/core";
import { read, write } from "./driver.js";
import { uuid } from "./ids.js";

export interface UserRecord extends User {
  passwordHash: string;
}

const USER_RETURN = "u { .id, .email, .displayName, .createdAt } AS user";

export async function createUser(input: {
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
}): Promise<User> {
  const id = uuid();
  return write(
    `CREATE (u:User {id: $id, email: $email, displayName: $displayName,
                     passwordHash: $passwordHash, createdAt: $createdAt})
     RETURN ${USER_RETURN}`,
    { id, ...input },
    (res) => res.records[0]!.get("user") as User,
  );
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const rows = await read(
    `MATCH (u:User {email: $email})
     RETURN u { .id, .email, .displayName, .createdAt, .passwordHash } AS user`,
    { email },
    (r) => r.get("user") as UserRecord,
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const rows = await read(
    `MATCH (u:User {id: $id}) RETURN ${USER_RETURN}`,
    { id },
    (r) => r.get("user") as User,
  );
  return rows[0] ?? null;
}

export async function countUsers(): Promise<number> {
  const rows = await read(`MATCH (u:User) RETURN count(u) AS n`, {}, (r) => r.get("n") as number);
  return rows[0] ?? 0;
}

/**
 * Find or create a user from an OAuth identity. Matched first by (provider, sub),
 * then by email (linking a social login to an existing email account). Passwordless.
 */
export async function upsertOAuthUser(input: {
  provider: string;
  sub: string;
  email: string;
  displayName: string;
  now: string;
}): Promise<User> {
  const byProvider = await read(
    `MATCH (u:User {oauthProvider: $provider, oauthSub: $sub}) RETURN ${USER_RETURN}`,
    { provider: input.provider, sub: input.sub },
    (r) => r.get("user") as User,
  );
  if (byProvider[0]) return byProvider[0];

  const byEmail = input.email
    ? await read(
        `MATCH (u:User {email: $email})
         SET u.oauthProvider = $provider, u.oauthSub = $sub
         RETURN ${USER_RETURN}`,
        { email: input.email, provider: input.provider, sub: input.sub },
        (r) => r.get("user") as User,
      )
    : [];
  if (byEmail[0]) return byEmail[0];

  const id = uuid();
  const email = input.email || `${input.provider}_${input.sub}@users.stressforge.app`;
  return write(
    `CREATE (u:User {id: $id, email: $email, displayName: $displayName,
                     passwordHash: $passwordHash, oauthProvider: $provider, oauthSub: $sub,
                     createdAt: $now})
     RETURN ${USER_RETURN}`,
    {
      id,
      email,
      displayName: input.displayName || email.split("@")[0],
      passwordHash: `oauth$${input.provider}$disabled`,
      provider: input.provider,
      sub: input.sub,
      now: input.now,
    },
    (res) => res.records[0]!.get("user") as User,
  );
}
