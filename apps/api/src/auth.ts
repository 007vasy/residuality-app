import jwt from "jsonwebtoken";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ROLE_RANK, type Role } from "@residuality/core";
import { getMemberRole } from "@residuality/db";

export interface AuthedUser {
  userId: string;
}

export function signJwt(userId: string, secret: string): string {
  return jwt.sign({ sub: userId }, secret, { expiresIn: "30d" });
}

export function verifyJwt(token: string, secret: string): string | null {
  try {
    const payload = jwt.verify(token, secret) as jwt.JwtPayload;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

/** preHandler that requires a valid Bearer JWT and sets request.userId. */
export function makeAuthenticate(secret: string) {
  return async function authenticate(req: FastifyRequest, reply: FastifyReply) {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const userId = token ? verifyJwt(token, secret) : null;
    if (!userId) {
      await reply.code(401).send({ error: "unauthenticated" });
      return;
    }
    req.userId = userId;
  };
}

/** Assert the current user has at least `min` role on the project; else 403. */
export async function requireRole(
  req: FastifyRequest,
  reply: FastifyReply,
  projectId: string,
  min: Role,
): Promise<Role | null> {
  const role = req.userId ? await getMemberRole(projectId, req.userId) : null;
  if (!role || ROLE_RANK[role] < ROLE_RANK[min]) {
    await reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return role;
}
