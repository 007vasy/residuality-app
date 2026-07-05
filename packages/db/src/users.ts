import type { User } from "@residuality/core";
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
