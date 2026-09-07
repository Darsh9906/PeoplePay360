import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { departments, employees, payruns, payslips } from "@/db/schema";
import { isResponse, resolveAccess, canReadPayroll } from "../_lib/access";
import { forbidden, ok, serverError } from "../_lib/responses";

export async function GET(request: Request) {
  try {
    const access = await resolveAccess();

    if (isResponse(access)) {
      return access;
    }

    if (!canReadPayroll(access.user.role) && !access.scopeEmployeeId) {
      return forbidden("Your role does not allow this action");
    }

    const { searchParams } = new URL(request.url);
    const payrunId = searchParams.get("payrunId");
    const employeeId = searchParams.get("employeeId");
    const filters = [
      eq(employees.organizationId, access.organizationId),
      access.scopeEmployeeId
        ? eq(payslips.employeeId, access.scopeEmployeeId)
        : undefined,
      payrunId ? eq(payslips.payrunId, payrunId) : undefined,
      employeeId ? eq(payslips.employeeId, employeeId) : undefined,
    ].filter(Boolean);

    const rows = await db
      .select({
        id: payslips.id,
        payrunId: payslips.payrunId,
        payrunName: payruns.name,
        employeeId: payslips.employeeId,
        employeeCode: employees.employeeCode,
        employeeName: sql<string>`concat(${employees.firstName}, ' ', ${employees.lastName})`,
        department: departments.name,
        periodStart: payruns.periodStart,
        periodEnd: payruns.periodEnd,
        workedDays: payslips.workedDays,
        leaveDays: payslips.leaveDays,
        grossPay: payslips.grossPay,
        totalDeductions: payslips.totalDeductions,
        netPay: payslips.netPay,
        status: payslips.status,
      })
      .from(payslips)
      .innerJoin(payruns, eq(payslips.payrunId, payruns.id))
      .innerJoin(employees, eq(payslips.employeeId, employees.id))
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(payruns.periodEnd));

    return ok(rows);
  } catch (error) {
    return serverError(error);
  }
}
