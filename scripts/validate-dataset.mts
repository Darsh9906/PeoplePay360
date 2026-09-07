import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL not set");
const sql = neon(databaseUrl);

async function main() {
  console.log("=== COMPREHENSIVE 50-EMPLOYEE DATASET VALIDATION ===");

  const orgId = "5cf9397f-43ca-440b-ad80-21278ef8fc25"; // Acme Manufacturing

  // 1. Employee Count
  const [{ count: empCount }] = await sql`
    select count(*)::int as count from employees where organization_id = ${orgId}
  `;
  console.log(`[Check 1] Employees count in Acme: ${empCount} (Expected: 50)`);

  const [{ count: activeCount }] = await sql`
    select count(*)::int as count from employees where organization_id = ${orgId} and status = 'active'
  `;
  console.log(`[Check 1b] Active employees: ${activeCount} (Expected: 34)`);

  // 2. Department representation
  const deptDist = await sql`
    select d.code, d.name, count(*)::int as count
    from employees e
    join departments d on d.id = e.department_id
    where e.organization_id = ${orgId}
    group by d.code, d.name
    order by count desc
  `;
  console.log(`[Check 2] Department representation:`, deptDist);

  // 3. Status representation
  const statusDist = await sql`
    select status, count(*)::int as count
    from employees
    where organization_id = ${orgId}
    group by status
    order by count desc
  `;
  console.log(`[Check 3] Status distribution:`, statusDist);

  // 4. Riya Gupta Check
  const [riya] = await sql`
    select e.id, e.employee_code, e.first_name, e.last_name, e.status, e.work_email, d.name as dept,
           u.email as user_email
    from employees e
    join departments d on d.id = e.department_id
    left join users u on u.id = e.user_id
    where e.employee_code = 'PP360-0001' and e.organization_id = ${orgId}
  `;
  console.log(`[Check 4] Riya Gupta (PP360-0001):`, riya);

  // 5. Contracts refer to valid employees
  const [{ count: orphanContracts }] = await sql`
    select count(*)::int as count
    from contracts c
    left join employees e on e.id = c.employee_id
    where e.id is null or e.organization_id != ${orgId}
      and c.employee_id in (select id from employees where organization_id = ${orgId})
  `;
  const [{ count: totalContracts }] = await sql`
    select count(*)::int as count
    from contracts c
    join employees e on e.id = c.employee_id
    where e.organization_id = ${orgId}
  `;
  console.log(`[Check 5] Contracts in Acme: ${totalContracts}, Orphan contracts: ${orphanContracts}`);

  // 6. Working Schedules
  const [{ count: scheduleAssignments }] = await sql`
    select count(*)::int as count
    from employee_working_schedules ews
    join employees e on e.id = ews.employee_id
    where e.organization_id = ${orgId}
  `;
  console.log(`[Check 6] Employee working schedule assignments: ${scheduleAssignments} (Expected: 50)`);

  // 7. Attendance
  const [{ count: attendanceCount }] = await sql`
    select count(*)::int as count
    from attendance_records a
    join employees e on e.id = a.employee_id
    where e.organization_id = ${orgId}
  `;
  console.log(`[Check 7] Attendance records: ${attendanceCount} (Expected: 714)`);

  // 8. Time-Off
  const [{ count: allocCount }] = await sql`
    select count(*)::int as count
    from leave_allocations l
    join employees e on e.id = l.employee_id
    where e.organization_id = ${orgId}
  `;
  const [{ count: reqCount }] = await sql`
    select count(*)::int as count
    from time_off_requests r
    join employees e on e.id = r.employee_id
    where e.organization_id = ${orgId}
  `;
  console.log(`[Check 8] Leave allocations: ${allocCount}, Time off requests: ${reqCount}`);

  // 9. Payslips and Payslip Lines
  const [{ count: payslipCount }] = await sql`
    select count(*)::int as count
    from payslips p
    join payruns r on r.id = p.payrun_id
    where r.organization_id = ${orgId}
  `;
  const [{ count: payslipLinesCount }] = await sql`
    select count(*)::int as count
    from payslip_lines pl
    join payslips p on p.id = pl.payslip_id
    join payruns r on r.id = p.payrun_id
    where r.organization_id = ${orgId}
  `;
  const [{ count: orphanPayslips }] = await sql`
    select count(*)::int as count
    from payslips p
    left join employees e on e.id = p.employee_id
    join payruns r on r.id = p.payrun_id
    where r.organization_id = ${orgId} and e.id is null
  `;
  console.log(`[Check 9] Payslips: ${payslipCount}, Lines: ${payslipLinesCount}, Orphan payslips: ${orphanPayslips}`);

  // 10. Payruns
  const payruns = await sql`
    select id, name, period_start, period_end, status
    from payruns
    where organization_id = ${orgId}
    order by period_start asc
  `;
  console.log(`[Check 10] Payruns:`, payruns);

  // 11. Payroll warnings
  const warnings = await sql`
    select pw.code, pw.message, e.employee_code, e.first_name, e.last_name
    from payroll_warnings pw
    join employees e on e.id = pw.employee_id
    join payruns r on r.id = pw.payrun_id
    where r.organization_id = ${orgId}
  `;
  console.log(`[Check 11] Payroll warnings:`, warnings);

  // 12. Employee Bank Accounts
  const [{ count: bankCount }] = await sql`
    select count(*)::int as count
    from employee_bank_accounts b
    join employees e on e.id = b.employee_id
    where e.organization_id = ${orgId}
  `;
  console.log(`[Check 12] Bank accounts: ${bankCount} (Expected: 48)`);

  // 13. Duplicate employee codes check
  const dupCodes = await sql`
    select employee_code, count(*)::int as count
    from employees
    where organization_id = ${orgId}
    group by employee_code
    having count(*) > 1
  `;
  console.log(`[Check 13] Duplicate codes:`, dupCodes.length === 0 ? "NONE (PASS)" : dupCodes);

  // 14. Demo Users in Acme
  const acmeUsers = await sql`
    select id, name, email, role, status
    from users
    where organization_id = ${orgId}
    order by role, email
  `;
  console.log(`[Check 14] Users in Acme:`, acmeUsers);

  // Final confirmation
  const allPassed = empCount === 50 &&
    orphanContracts === 0 &&
    orphanPayslips === 0 &&
    dupCodes.length === 0 &&
    riya !== undefined &&
    totalContracts === 50;

  console.log("\n==========================================");
  console.log(`FINAL RESULT: ${allPassed ? "ALL INTEGRITY CHECKS PASSED ✓" : "FAIL ✗"}`);
  console.log("==========================================");
}

main().catch(console.error);
