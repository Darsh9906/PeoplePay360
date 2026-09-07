import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(databaseUrl);

async function main() {
  console.log("=== CHECKING RIYA GUPTA (PP360-0001) IN ACME MANUFACTURING ===");
  const acmeId = "5cf9397f-43ca-440b-ad80-21278ef8fc25";
  const riya = await sql`
    SELECT e.id, e.employee_code, e.first_name, e.last_name, e.work_email, e.status, e.organization_id,
           d.name as department_name, s.name as schedule_name
    FROM employees e
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN employee_working_schedules ews ON ews.employee_id = e.id
    LEFT JOIN working_schedules s ON ews.schedule_id = s.id
    WHERE e.employee_code = 'PP360-0001' AND e.organization_id = ${acmeId}
  `;
  console.log("Riya Employee:", JSON.stringify(riya, null, 2));

  if (riya.length > 0) {
    const empId = riya[0].id;
    const contracts = await sql`SELECT id, status, monthly_wage, salary_structure_id, start_date FROM contracts WHERE employee_id = ${empId}`;
    console.log("Riya Contracts:", JSON.stringify(contracts, null, 2));

    const bank = await sql`SELECT id, bank_name, account_number_masked, is_primary FROM employee_bank_accounts WHERE employee_id = ${empId}`;
    console.log("Riya Bank Accounts:", JSON.stringify(bank, null, 2));

    const attendanceCount = await sql`SELECT count(*)::int as count FROM attendance_records WHERE employee_id = ${empId}`;
    console.log("Riya Attendance records:", attendanceCount[0].count);

    const leaveCount = await sql`SELECT count(*)::int as count FROM time_off_requests WHERE employee_id = ${empId}`;
    console.log("Riya Leave requests:", leaveCount[0].count);

    const payslips = await sql`SELECT id, payrun_id, net_pay, status FROM payslips WHERE employee_id = ${empId}`;
    console.log("Riya Payslips:", JSON.stringify(payslips, null, 2));
  }

  console.log("\n=== DATABASE INTEGRITY CHECKS ===");

  // 1. Orphaned contracts
  const orphanContracts = await sql`
    SELECT c.id FROM contracts c
    LEFT JOIN employees e ON c.employee_id = e.id
    WHERE e.id IS NULL
  `;
  console.log("Orphaned Contracts:", orphanContracts.length);

  // 2. Orphaned attendance
  const orphanAttendance = await sql`
    SELECT a.id FROM attendance_records a
    LEFT JOIN employees e ON a.employee_id = e.id
    WHERE e.id IS NULL
  `;
  console.log("Orphaned Attendance:", orphanAttendance.length);

  // 3. Orphaned time off
  const orphanTimeOff = await sql`
    SELECT t.id FROM time_off_requests t
    LEFT JOIN employees e ON t.employee_id = e.id
    WHERE e.id IS NULL
  `;
  console.log("Orphaned Time Off Requests:", orphanTimeOff.length);

  // 4. Orphaned leave allocations
  const orphanAllocations = await sql`
    SELECT l.id FROM leave_allocations l
    LEFT JOIN employees e ON l.employee_id = e.id
    WHERE e.id IS NULL
  `;
  console.log("Orphaned Leave Allocations:", orphanAllocations.length);

  // 5. Orphaned payslips
  const orphanPayslips = await sql`
    SELECT p.id FROM payslips p
    LEFT JOIN employees e ON p.employee_id = e.id
    WHERE e.id IS NULL
  `;
  console.log("Orphaned Payslips:", orphanPayslips.length);

  // 6. Orphaned payslip lines
  const orphanLines = await sql`
    SELECT l.id FROM payslip_lines l
    LEFT JOIN payslips p ON l.payslip_id = p.id
    WHERE p.id IS NULL
  `;
  console.log("Orphaned Payslip Lines:", orphanLines.length);

  // 7. Duplicate employee codes within organization
  const duplicateCodes = await sql`
    SELECT organization_id, employee_code, count(*)::int as c
    FROM employees
    GROUP BY organization_id, employee_code
    HAVING count(*) > 1
  `;
  console.log("Duplicate Employee Codes in any org:", JSON.stringify(duplicateCodes, null, 2));

  // 8. Inconsistent organization_id between payrun and employees on payslips
  const orgMismatchPayslips = await sql`
    SELECT p.id, e.organization_id as e_org, pr.organization_id as pr_org
    FROM payslips p
    JOIN payruns pr ON p.payrun_id = pr.id
    JOIN employees e ON p.employee_id = e.id
    WHERE e.organization_id <> pr.organization_id
  `;
  console.log("Payslips with Org Mismatch:", orgMismatchPayslips.length);

  // 9. Employee counts per organization
  const orgCounts = await sql`
    SELECT organization_id, count(*)::int as count
    FROM employees
    GROUP BY organization_id
  `;
  console.log("Employees per Organization:", JSON.stringify(orgCounts, null, 2));

  // 11. Salary Rules and Payslip lines check
  const rules = await sql`
    SELECT sr.id, sr.name, sr.code, sr.category, sr.sequence, sr.amount, sr.percentage_base_code
    FROM salary_rules sr
    JOIN salary_structures ss ON sr.structure_id = ss.id
    WHERE ss.organization_id = ${acmeId}
    ORDER BY sr.sequence ASC
  `;
  console.log("\n=== SALARY RULES IN SEQUENCE ===");
  console.table(rules);

  const p = await sql`SELECT id, name, period_start, period_end, status FROM payruns WHERE id = 'c194fc95-9614-4977-83ef-649cb6918c4b'`;
  console.log("\n=== PAYRUN DETAILS ===", p);
  const ps = await sql`SELECT id, worked_days, leave_days, gross_pay, net_pay FROM payslips WHERE payrun_id = 'c194fc95-9614-4977-83ef-649cb6918c4b' AND employee_id = '75f60f77-eee0-4e5d-a323-f21a49cf3d99'`;
  console.log("\n=== RIYA PAYSLIP ===", ps);
}

main().catch(console.error);
