import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { isResponse, resolveAccess } from "../_lib/access";
import { badRequest, created, forbidden, ok, serverError } from "../_lib/responses";

const auditLogSchema = z.object({
  actorUserId: z.string().uuid().optional(),
  action: z.enum(["create", "update", "delete", "login", "logout", "approve", "reject", "compute", "pay"]),
  entityType: z.string().min(1),
  entityId: z.string().uuid().optional(),
  summary: z.string().min(1),
  metadata: z.unknown().optional(),
  ipAddress: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const access = await resolveAccess();

    if (isResponse(access)) {
      return access;
    }

    if (access.user.role === "employee") {
      return forbidden("Your role does not allow this action");
    }

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entityType");
    const actorUserId = searchParams.get("actorUserId");

    // Scope to users belonging to caller's organization
    const orgUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.organizationId, access.organizationId));
    const orgUserIds = orgUsers.map((u) => u.id);

    if (orgUserIds.length === 0) {
      return ok([]);
    }

    const filters = [
      inArray(auditLogs.actorUserId, orgUserIds),
      entityType ? eq(auditLogs.entityType, entityType) : undefined,
      actorUserId ? eq(auditLogs.actorUserId, actorUserId) : undefined,
    ].filter(Boolean);

    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(...filters))
      .orderBy(desc(auditLogs.createdAt));

    return ok(rows);
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: Request) {
  try {
    const access = await resolveAccess();

    if (isResponse(access)) {
      return access;
    }

    if (access.user.role === "employee") {
      return forbidden("Your role does not allow this action");
    }

    const parsed = auditLogSchema.safeParse(await request.json());

    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message ?? "Invalid request");
    }

    const [auditLog] = await db
      .insert(auditLogs)
      .values({
        ...parsed.data,
        actorUserId: access.user.id,
        metadata: parsed.data.metadata
          ? JSON.stringify(parsed.data.metadata)
          : undefined,
      })
      .returning();

    return created(auditLog);
  } catch (error) {
    return serverError(error);
  }
}
