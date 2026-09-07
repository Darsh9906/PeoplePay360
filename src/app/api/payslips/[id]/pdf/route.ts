import { loadPayslip } from "@/lib/payroll/payslip-data";
import { payslipFileName, renderPayslipPdf } from "@/lib/payroll/payslip-pdf";
import { isResponse, resolveAccess, canReadPayroll } from "../../../_lib/access";
import { forbidden, notFound, serverError } from "../../../_lib/responses";

type Params = { params: Promise<{ id: string }> };

// @react-pdf/renderer needs the Node runtime, not the edge runtime.
export const runtime = "nodejs";

export async function GET(request: Request, ctx: Params) {
  try {
    const access = await resolveAccess();

    if (isResponse(access)) {
      return access;
    }

    const { id } = await ctx.params;
    const payslip = await loadPayslip(id);

    if (!payslip) {
      return notFound("Payslip not found");
    }

    // Non-payroll roles may only open their own payslip.
    if (!canReadPayroll(access.user.role) && payslip.employeeId !== access.scopeEmployeeId) {
      return forbidden("You can only view your own payslip");
    }

    const pdf = await renderPayslipPdf(payslip);
    const { searchParams } = new URL(request.url);
    // ?download=true forces a save dialog instead of opening in the viewer.
    const disposition =
      searchParams.get("download") === "true" ? "attachment" : "inline";

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${payslipFileName(payslip)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return serverError(error);
  }
}
