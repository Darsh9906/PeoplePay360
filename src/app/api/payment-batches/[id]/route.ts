import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { paymentBatches } from "@/db/schema";
import { canReadPayroll, isResponse, resolveAccess } from "../../_lib/access";
import { writeAuditLog } from "../../_lib/audit";
import { badRequest, forbidden, notFound, ok, serverError } from "../../_lib/responses";

type Params = { params: Promise<{ id: string }> };

const updateBatchSchema = z.object({
  status: z.enum(["draft", "approved", "processing", "paid", "failed"]).optional(),
  approvedBy: z.string().uuid().nullable().optional(),
});

export async function GET(_request: Request, ctx: Params) {
  try {
    const access = await resolveAccess();

    if (isResponse(access)) {
      return access;
    }

    if (!canReadPayroll(access.user.role)) {
      return forbidden("Your role does not allow this action");
    }

    const { id } = await ctx.params;
    const batch = await db.query.paymentBatches.findFirst({
      where: eq(paymentBatches.id, id),
      with: { payrun: true, transactions: true },
    });

    if (!batch || batch.payrun?.organizationId !== access.organizationId) {
      return notFound("Payment batch not found");
    }

    return ok(batch);
  } catch (error) {
    return serverError(error);
  }
}

export async function PATCH(request: Request, ctx: Params) {
  try {
    const access = await resolveAccess();

    if (isResponse(access)) {
      return access;
    }

    if (!canReadPayroll(access.user.role)) {
      return forbidden("Your role does not allow this action");
    }

    const { id } = await ctx.params;

    const existing = await db.query.paymentBatches.findFirst({
      where: eq(paymentBatches.id, id),
      with: { payrun: true },
    });

    if (!existing || existing.payrun?.organizationId !== access.organizationId) {
      return notFound("Payment batch not found");
    }

    const parsed = updateBatchSchema.safeParse(await request.json());

    if (!parsed.success) {
      return badRequest(parsed.error.issues[0]?.message ?? "Invalid request");
    }

    const [batch] = await db
      .update(paymentBatches)
      .set(parsed.data)
      .where(eq(paymentBatches.id, id))
      .returning();

    if (!batch) {
      return notFound("Payment batch not found");
    }

    await writeAuditLog({
      actorUserId: access.user.id,
      action: "update",
      entityType: "payment_batch",
      entityId: id,
      summary: `Updated payment batch to ${batch.status}`,
    });

    return ok(batch);
  } catch (error) {
    return serverError(error);
  }
}
