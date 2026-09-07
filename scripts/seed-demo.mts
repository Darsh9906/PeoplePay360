/**
 * Seeds a 50-employee demo workspace.
 *
 * DESTRUCTIVE. Every operational record in the target organization is removed
 * before seeding: employees, contracts, attendance, time off, payroll and
 * payments. The organization row and all user logins are preserved, so the
 * signed-in admin keeps their account.
 *
 * Rows go in with `insert ... select from unnest(...)`, one round trip per
 * chunk. Row-at-a-time inserts would be ~8,000 HTTP requests on the Neon
 * driver; this is a few dozen.
 *
 *   npm run db:seed:demo
 */
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
const EMPLOYEE_COUNT = Number(process.env.SEED_EMPLOYEES ?? 50);
/** Employees that get day-by-day attendance. The rest keep a lighter history. */
const ATTENDANCE_SAMPLE = Number(process.env.SEED_ATTENDANCE_SAMPLE ?? 34);
const CHUNK = 500;

/** Login created when the workspace has no admin yet. */
const demoAdminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@peoplepay360.test";
const demoAdminPassword = process.env.SEED_ADMIN_PASSWORD ?? "DemoPass123!";
/** Only set when the caller explicitly asked for a password. */
const passwordWasRequested = Boolean(process.env.SEED_ADMIN_PASSWORD);
const demoCompanyName = process.env.SEED_COMPANY ?? "PeoplePay360 Demo";

/** Same pbkdf2 format as src/app/api/_lib/auth.ts, so the login actually works. */
function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 120_000, 64, "sha512").toString("hex");
  return `pbkdf2$120000$${salt}$${hash}`;
}

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const sql = neon(databaseUrl);

type IdRow = { id: string };

/* ------------------------------------------------------------------ *
 * Deterministic randomness — the same seed always produces the same
 * workspace, so a demo can be reset and still look identical.
 * ------------------------------------------------------------------ */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260906);
const pick = <T,>(items: readonly T[]) => items[Math.floor(rand() * items.length)];
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

function money(amount: number) {
  return (Math.round(amount * 100) / 100).toFixed(2);
}

function chunk<T>(rows: T[], size = CHUNK) {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    out.push(rows.slice(i, i + size));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Calendar
 * ------------------------------------------------------------------ */
const periods = [
  { name: "June 2026", start: "2026-06-01", end: "2026-06-30", status: "paid" },
  { name: "July 2026", start: "2026-07-01", end: "2026-07-31", status: "paid" },
  { name: "August 2026", start: "2026-08-01", end: "2026-08-31", status: "computed" },
];
const yearStart = "2026-01-01";
const attendancePeriod = periods[periods.length - 1];

function weekdaysBetween(startDate: string, endDate: string) {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day >= 1 && day <= 5) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/* ------------------------------------------------------------------ *
 * Reference data
 * ------------------------------------------------------------------ */
const departments = [
  { code: "ENG", name: "Engineering", share: 0.3 },
  { code: "SLS", name: "Sales", share: 0.2 },
  { code: "OPS", name: "Operations", share: 0.18 },
  { code: "SUP", name: "Support", share: 0.14 },
  { code: "FIN", name: "Finance", share: 0.1 },
  { code: "HR", name: "People", share: 0.08 },
];

const titlesByDepartment: Record<string, string[]> = {
  ENG: ["Backend Engineer", "Frontend Engineer", "QA Engineer", "Platform Engineer", "Engineering Manager"],
  SLS: ["Account Executive", "Sales Development Rep", "Regional Sales Lead", "Solutions Consultant"],
  OPS: ["Operations Analyst", "Logistics Coordinator", "Operations Manager", "Process Specialist"],
  SUP: ["Support Engineer", "Support Lead", "Customer Success Manager"],
  FIN: ["Financial Analyst", "Payroll Specialist", "Accounts Manager", "Controller"],
  HR: ["HR Generalist", "Recruiter", "People Partner", "HR Manager"],
};

const wageBands: Record<string, [number, number]> = {
  ENG: [55000, 185000],
  SLS: [45000, 150000],
  OPS: [38000, 110000],
  SUP: [32000, 95000],
  FIN: [48000, 160000],
  HR: [40000, 125000],
};

const firstNames = [
  "Aarav", "Anaya", "Dev", "Kavya", "Ishaan", "Meera", "Rohan", "Priya", "Arjun", "Sana",
  "Vihaan", "Diya", "Kabir", "Riya", "Aditya", "Naina", "Yash", "Tara", "Omar", "Zara",
  "Nikhil", "Isha", "Rahul", "Aditi", "Karan", "Sneha", "Varun", "Pooja", "Manav", "Leela",
  "Farhan", "Nisha", "Siddharth", "Ananya", "Imran", "Rhea", "Gaurav", "Simran", "Aryan", "Juhi",
];

const lastNames = [
  "Rao", "Mehta", "Nair", "Gupta", "Sheikh", "Iyer", "Patel", "Singh", "Desai", "Khan",
  "Joshi", "Verma", "Menon", "Bose", "Chopra", "Reddy", "Kulkarni", "Banerjee", "Shah", "Pillai",
];

const salaryRules = [
  { name: "Basic Salary", code: "BASIC", category: "basic", sequence: 10, amount: 50, base: "WAGE" },
  { name: "House Rent Allowance", code: "HRA", category: "allowance", sequence: 20, amount: 40, base: "BASIC" },
  { name: "Conveyance Allowance", code: "CONV", category: "allowance", sequence: 30, amount: 1600, base: null },
  { name: "Gross Salary", code: "GROSS", category: "gross", sequence: 50, amount: 0, base: null },
  { name: "Provident Fund", code: "PF", category: "deduction", sequence: 70, amount: 12, base: "BASIC" },
  { name: "Professional Tax", code: "PT", category: "deduction", sequence: 80, amount: 200, base: null },
  { name: "Net Salary", code: "NET", category: "net", sequence: 100, amount: 0, base: null },
];

const statutorySettings = [
  { component: "pf", code: "PF_EMPLOYEE", name: "PF Employee Rate (%)", rate: "12.00", fixedAmount: null },
  { component: "professional_tax", code: "PT_MONTHLY", name: "Professional Tax (Monthly)", rate: null, fixedAmount: "200.00" },
  { component: "esi", code: "ESI_EMPLOYEE", name: "ESI Employee Rate (%)", rate: "0.75", fixedAmount: null },
];

const timeOffTypes = [
  { code: "EL", name: "Earned Leave", color: "#1f6fb2", days: 18 },
  { code: "SL", name: "Sick Leave", color: "#eb6834", days: 8 },
  { code: "CO", name: "Comp Off", color: "#1baf7a", days: 5 },
];

/** Wage split matching lib/payroll — the demo must agree with the calculator. */
function payrollLines(fullWage: number, ratio: number) {
  const wage = fullWage * ratio;
  const basic = wage * 0.5;
  const hra = basic * 0.4;
  const conveyance = 1600;
  const gross = basic + hra + conveyance;
  const pf = basic * 0.12;
  const professionalTax = 200;
  const net = gross - pf - professionalTax;

  return {
    gross,
    deductions: pf + professionalTax,
    net,
    lines: [
      { name: "Basic Salary", code: "BASIC", category: "basic", sequence: 10, amount: basic },
      { name: "House Rent Allowance", code: "HRA", category: "allowance", sequence: 20, amount: hra },
      { name: "Conveyance Allowance", code: "CONV", category: "allowance", sequence: 30, amount: conveyance },
      { name: "Gross Salary", code: "GROSS", category: "gross", sequence: 50, amount: gross },
      { name: "Provident Fund", code: "PF", category: "deduction", sequence: 70, amount: pf },
      { name: "Professional Tax", code: "PT", category: "deduction", sequence: 80, amount: professionalTax },
      { name: "Net Salary", code: "NET", category: "net", sequence: 100, amount: net },
    ],
  };
}

async function one<T extends IdRow>(query: Promise<unknown>) {
  const rows = (await query) as T[];
  if (!rows[0]) {
    throw new Error("Expected one row, got none");
  }
  return rows[0];
}

/* ------------------------------------------------------------------ *
 * Wipe — scoped to one organization. Users and the organization stay.
 * ------------------------------------------------------------------ */
async function wipe(organizationId: string) {
  // Children are deleted explicitly, parent-last. Relying on ON DELETE CASCADE
  // is not enough: several foreign keys do not cascade
  // (payment_transactions.payslip_id, time_off_requests.allocation_id,
  // payslips.employee_id, ...), and Postgres does not order one statement's
  // cascades to satisfy them. The whole wipe runs as a single transaction, so a
  // failure leaves the workspace untouched rather than half-deleted.
  await sql.transaction([
    // --- payments ---
    sql`
      delete from payment_transactions
      where employee_id in (select id from employees where organization_id = ${organizationId})
         or batch_id in (
           select b.id from payment_batches b
           join payruns r on r.id = b.payrun_id
           where r.organization_id = ${organizationId}
         )
    `,
    sql`
      delete from payment_batches
      where payrun_id in (select id from payruns where organization_id = ${organizationId})
    `,

    // --- payroll ---
    sql`
      delete from payroll_warnings
      where payrun_id in (select id from payruns where organization_id = ${organizationId})
         or employee_id in (select id from employees where organization_id = ${organizationId})
    `,
    // payslip_lines cascade from payslips; nothing else references them.
    sql`
      delete from payslips
      where payrun_id in (select id from payruns where organization_id = ${organizationId})
    `,
    sql`
      delete from payrun_employees
      where payrun_id in (select id from payruns where organization_id = ${organizationId})
    `,
    sql`delete from payruns where organization_id = ${organizationId}`,

    // --- time off (requests before allocations: allocation_id does not cascade) ---
    sql`
      delete from time_off_requests
      where employee_id in (select id from employees where organization_id = ${organizationId})
    `,
    sql`
      delete from leave_allocations
      where employee_id in (select id from employees where organization_id = ${organizationId})
    `,

    // --- employee-owned records ---
    sql`
      delete from attendance_records
      where employee_id in (select id from employees where organization_id = ${organizationId})
    `,
    sql`
      delete from employee_working_schedules
      where employee_id in (select id from employees where organization_id = ${organizationId})
    `,
    sql`
      delete from employee_bank_accounts
      where employee_id in (select id from employees where organization_id = ${organizationId})
    `,
    sql`
      delete from contracts
      where employee_id in (select id from employees where organization_id = ${organizationId})
    `,
    sql`delete from employees where organization_id = ${organizationId}`,

    // --- reference data ---
    sql`
      delete from salary_rules
      where structure_id in (select id from salary_structures where organization_id = ${organizationId})
    `,
    sql`delete from salary_structures where organization_id = ${organizationId}`,
    sql`
      delete from working_schedule_lines
      where schedule_id in (select id from working_schedules where organization_id = ${organizationId})
    `,
    sql`delete from working_schedules where organization_id = ${organizationId}`,
    sql`delete from time_off_types where organization_id = ${organizationId}`,
    sql`delete from statutory_settings where organization_id = ${organizationId}`,
    sql`delete from departments where organization_id = ${organizationId}`,
  ]);
}

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */
type DemoEmployee = {
  code: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  departmentCode: string;
  wage: number;
  status: "active" | "inactive" | "terminated";
  hasBank: boolean;
  contractEndsSoon: boolean;
};

function generatePeople(count: number): DemoEmployee[] {
  // Department slots, expanded from the share weights then filled in order so
  // the mix is stable rather than luck-of-the-draw.
  const slots: string[] = [];
  for (const department of departments) {
    const size = Math.round(department.share * count);
    for (let i = 0; i < size; i += 1) slots.push(department.code);
  }
  while (slots.length < count) slots.push("ENG");
  slots.length = count;

  return Array.from({ length: count }, (_, index) => {
    const departmentCode = slots[index];
    const [minWage, maxWage] = wageBands[departmentCode];
    const firstName = pick(firstNames);
    const lastName = pick(lastNames);
    const sequence = index + 1;

    // A deliberate mix so the status filter and headcount tiles have something
    // to show. The first count - 16 stay active (e.g. 34 of 50).
    const status: DemoEmployee["status"] =
      index >= count - 6 ? "terminated" : index >= count - 16 ? "inactive" : "active";

    return {
      code: `PP360-${String(sequence).padStart(4, "0")}`,
      firstName,
      lastName,
      // The sequence keeps the address unique even when names repeat.
      email: `${firstName}.${lastName}${sequence}`.toLowerCase() + "@demo.peoplepay360.test",
      title: pick(titlesByDepartment[departmentCode]),
      departmentCode,
      wage: Math.round(between(minWage, maxWage) / 500) * 500,
      status,
      // A few active staff without bank details, to populate that alert.
      hasBank: !(status === "active" && index % 31 === 0),
      contractEndsSoon: index % 47 === 0,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */
async function run() {
  type AdminRow = {
    id: string;
    email: string;
    organization_id: string;
    organization_name: string;
  };

  const [admin] = (await sql`
    select u.id, u.email, u.organization_id, o.name as organization_name
    from users u
    join organizations o on o.id = u.organization_id
    where u.email = ${demoAdminEmail} and u.role = 'admin'
    limit 1
  `) as AdminRow[];

  // An explicit SEED_ADMIN_EMAIL that matches nothing must stop, not fall back.
  // Falling back would wipe and reseed a workspace the caller never named — and
  // with SEED_ADMIN_PASSWORD set, reset a password on an account they did not
  // choose.
  if (!admin && process.env.SEED_ADMIN_EMAIL) {
    throw new Error(
      `No admin user with email "${demoAdminEmail}" and an organization was found.\n` +
        "Check the address, or drop SEED_ADMIN_EMAIL to create a fresh demo workspace.",
    );
  }

  const [fallback] = admin
    ? []
    : ((await sql`
        select u.id, u.email, u.organization_id, o.name as organization_name
        from users u
        join organizations o on o.id = u.organization_id
        where u.role = 'admin' and u.organization_id is not null
        order by u.created_at desc
        limit 1
      `) as AdminRow[]);

  let target = admin ?? fallback;
  let createdLogin = false;

  // Nothing to attach to: build the workspace and an admin who can sign in.
  if (!target) {
    console.log("No admin workspace found — creating one.");

    const organization = await one(sql`
      insert into organizations (name, slug, email_domain, industry, company_size, country_code, currency)
      values (
        ${demoCompanyName},
        ${demoCompanyName.toLowerCase().replace(/[^a-z0-9]+/g, "-")},
        ${demoAdminEmail.split("@")[1]},
        'Software & IT',
        '201-500',
        'IN',
        'INR'
      )
      returning id
    `);

    const created = await one(sql`
      insert into users (
        organization_id, name, email, role, status, password_hash,
        must_change_password, email_verified_at, password_changed_at
      )
      values (
        ${organization.id}, 'Demo Admin', ${demoAdminEmail}, 'admin', 'active',
        ${hashPassword(demoAdminPassword)}, false, now(), now()
      )
      returning id
    `);

    createdLogin = true;
    target = {
      id: created.id,
      email: demoAdminEmail,
      organization_id: organization.id,
      organization_name: demoCompanyName,
    };
  }

  const organizationId = target.organization_id;

  console.log(`\nWorkspace: ${target.organization_name}`);
  console.log(
    "This DELETES every employee, contract, attendance record, time off record,\n" +
      "payrun, payslip and payment in that workspace. The organization and all\n" +
      "user logins are kept.",
  );

  // A window to abort, unless the caller has already said yes.
  if (process.env.SEED_YES !== "1") {
    for (let seconds = 5; seconds > 0; seconds -= 1) {
      process.stdout.write(`\rStarting in ${seconds}s — Ctrl+C to cancel. `);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    process.stdout.write("\r".padEnd(48) + "\r");
  }

  // Resetting a password is opt-in: it happens only when SEED_ADMIN_PASSWORD is
  // set explicitly, never on a plain run.
  let passwordReset = false;
  if (!createdLogin && passwordWasRequested) {
    await sql`
      update users
      set password_hash = ${hashPassword(demoAdminPassword)},
          must_change_password = false,
          password_changed_at = now()
      where id = ${target.id}
    `;
    passwordReset = true;
  }

  console.log("Clearing existing operational data...");
  await wipe(organizationId);

  // ---- Reference data ----
  const departmentIds = new Map<string, string>();
  const departmentRows = (await sql`
    insert into departments (organization_id, name, code)
    select ${organizationId}::uuid, * from unnest(
      ${departments.map((d) => d.name)}::text[],
      ${departments.map((d) => d.code)}::text[]
    )
    returning id, code
  `) as { id: string; code: string }[];
  for (const row of departmentRows) departmentIds.set(row.code, row.id);

  const schedule = await one(sql`
    insert into working_schedules (
      organization_id, name, working_days, start_time, end_time,
      break_duration_minutes, weekly_hours, status
    )
    values (
      ${organizationId}, 'Standard 40 Hours', '1,2,3,4,5', '09:00', '18:00', 60, '40.00', 'active'
    )
    returning id
  `);

  await sql`
    insert into working_schedule_lines (schedule_id, day_of_week, start_time, end_time, break_minutes)
    select ${schedule.id}::uuid, unnest(${[1, 2, 3, 4, 5]}::int[]), '09:00', '18:00', 60
  `;

  const structure = await one(sql`
    insert into salary_structures (organization_id, name, code, is_active)
    values (${organizationId}, 'Regular Salary', 'REGULAR', true)
    returning id
  `);

  await sql`
    insert into salary_rules (structure_id, name, code, category, sequence, amount, percentage_base_code)
    select ${structure.id}::uuid, * from unnest(
      ${salaryRules.map((r) => r.name)}::text[],
      ${salaryRules.map((r) => r.code)}::text[],
      ${salaryRules.map((r) => r.category)}::text[]::salary_rule_category[],
      ${salaryRules.map((r) => r.sequence)}::int[],
      ${salaryRules.map((r) => money(r.amount))}::numeric[],
      ${salaryRules.map((r) => r.base)}::text[]
    )
  `;

  await sql`
    insert into statutory_settings (
      organization_id, component, code, name, rate, fixed_amount, effective_from, effective_to, is_active
    )
    select ${organizationId}::uuid, a, b, c, d, e, '2026-04-01'::date, null::date, true from unnest(
      ${statutorySettings.map((s) => s.component)}::text[]::statutory_component[],
      ${statutorySettings.map((s) => s.code)}::text[],
      ${statutorySettings.map((s) => s.name)}::text[],
      ${statutorySettings.map((s) => s.rate)}::numeric[],
      ${statutorySettings.map((s) => s.fixedAmount)}::numeric[]
    ) as t(a, b, c, d, e)
  `;

  const timeOffTypeRows = (await sql`
    insert into time_off_types (
      organization_id, name, code, unit, requires_allocation, requires_approval,
      is_paid, affects_payroll, color_hex, is_active
    )
    select ${organizationId}::uuid, a, b, 'days', true, true, true, true, c, true from unnest(
      ${timeOffTypes.map((t) => t.name)}::text[],
      ${timeOffTypes.map((t) => t.code)}::text[],
      ${timeOffTypes.map((t) => t.color)}::text[]
    ) as t(a, b, c)
    returning id, code
  `) as { id: string; code: string }[];
  const timeOffTypeIds = new Map(timeOffTypeRows.map((row) => [row.code, row.id]));

  // ---- Employees ----
  const people = generatePeople(EMPLOYEE_COUNT);
  const employeeIds = new Map<string, string>();

  for (const batch of chunk(people)) {
    const rows = (await sql`
      insert into employees (
        organization_id, employee_code, first_name, last_name, work_email,
        department_id, job_title, status, hire_date
      )
      select ${organizationId}::uuid, a, b, c, d, e, f, g, h from unnest(
        ${batch.map((p) => p.code)}::text[],
        ${batch.map((p) => p.firstName)}::text[],
        ${batch.map((p) => p.lastName)}::text[],
        ${batch.map((p) => p.email)}::text[],
        ${batch.map((p) => departmentIds.get(p.departmentCode)!)}::uuid[],
        ${batch.map((p) => p.title)}::text[],
        ${batch.map((p) => p.status)}::text[]::employee_status[],
        ${batch.map(() => yearStart)}::date[]
      ) as t(a, b, c, d, e, f, g, h)
      returning id, employee_code
    `) as { id: string; employee_code: string }[];

    for (const row of rows) employeeIds.set(row.employee_code, row.id);
  }

  const idFor = (person: DemoEmployee) => employeeIds.get(person.code)!;

  // ---- Schedules, contracts, bank accounts ----
  for (const batch of chunk(people)) {
    await sql`
      insert into employee_working_schedules (employee_id, schedule_id, effective_from, effective_to)
      select a, ${schedule.id}::uuid, ${yearStart}::date, null::date
      from unnest(${batch.map(idFor)}::uuid[]) as t(a)
    `;

    await sql`
      insert into contracts (
        employee_id, start_date, end_date, status, monthly_wage, currency, salary_structure_id
      )
      select a, ${yearStart}::date, b, c, d, 'INR', ${structure.id}::uuid from unnest(
        ${batch.map(idFor)}::uuid[],
        ${batch.map((p) => (p.contractEndsSoon ? "2026-10-15" : null))}::date[],
        ${batch.map((p) => (p.status === "terminated" ? "terminated" : "active"))}::text[]::contract_status[],
        ${batch.map((p) => money(p.wage))}::numeric[]
      ) as t(a, b, c, d)
    `;

    const banked = batch.filter((p) => p.hasBank);
    if (banked.length > 0) {
      await sql`
        insert into employee_bank_accounts (
          employee_id, account_holder_name, bank_name, account_number_masked, ifsc_code, is_primary
        )
        select a, b, c, d, e, true from unnest(
          ${banked.map(idFor)}::uuid[],
          ${banked.map((p) => `${p.firstName} ${p.lastName}`)}::text[],
          ${banked.map(() => pick(["HDFC Bank", "ICICI Bank", "Axis Bank", "State Bank of India"]))}::text[],
          ${banked.map(() => `XXXX${between(1000, 9999)}`)}::text[],
          ${banked.map(() => `HDFC0${between(100000, 999999)}`)}::text[]
        ) as t(a, b, c, d, e)
      `;
    }
  }

  // ---- Attendance for the sample ----
  const sample = people.filter((p) => p.status === "active").slice(0, ATTENDANCE_SAMPLE);
  const workdays = weekdaysBetween(attendancePeriod.start, attendancePeriod.end);
  type AttendanceRow = { employeeId: string; date: string; hours: string; status: string };
  const attendance: AttendanceRow[] = [];

  for (const date of workdays) {
    for (const person of sample) {
      const roll = rand();
      const status = roll > 0.94 ? "absent" : roll > 0.86 ? "late" : roll > 0.83 ? "half_day" : "present";
      const hours = status === "absent" ? 0 : status === "half_day" ? 4 : status === "late" ? 7.5 : 8 + (rand() > 0.85 ? 1.5 : 0);
      attendance.push({ employeeId: idFor(person), date, hours: money(hours), status });
    }
  }

  for (const batch of chunk(attendance)) {
    await sql`
      insert into attendance_records (employee_id, attendance_date, worked_hours, status)
      select a, b, c, d from unnest(
        ${batch.map((r) => r.employeeId)}::uuid[],
        ${batch.map((r) => r.date)}::date[],
        ${batch.map((r) => r.hours)}::numeric[],
        ${batch.map((r) => r.status)}::text[]::attendance_status[]
      ) as t(a, b, c, d)
    `;
  }

  // ---- Leave allocations and requests ----
  const activePeople = people.filter((p) => p.status === "active");
  type AllocationRow = { employeeId: string; typeId: string; allocated: string; consumed: string };
  const allocations: AllocationRow[] = [];

  for (const person of activePeople) {
    for (const type of timeOffTypes) {
      allocations.push({
        employeeId: idFor(person),
        typeId: timeOffTypeIds.get(type.code)!,
        allocated: money(type.days),
        consumed: money(Math.min(type.days, between(0, Math.round(type.days * 0.6)))),
      });
    }
  }

  for (const batch of chunk(allocations)) {
    await sql`
      insert into leave_allocations (
        employee_id, time_off_type_id, allocated_days, consumed_days, status, valid_from, valid_to
      )
      select a, b, c, d, 'approved'::allocation_status, ${yearStart}::date, '2026-12-31'::date from unnest(
        ${batch.map((r) => r.employeeId)}::uuid[],
        ${batch.map((r) => r.typeId)}::uuid[],
        ${batch.map((r) => r.allocated)}::numeric[],
        ${batch.map((r) => r.consumed)}::numeric[]
      ) as t(a, b, c, d)
    `;
  }

  const requesters = activePeople.slice(0, 70);
  await sql`
    insert into time_off_requests (
      employee_id, type_name, time_off_type_id, start_date, end_date, duration_days, status, reason
    )
    select a, b, c, d, e, f, g, 'Demo request'::text from unnest(
      ${requesters.map(idFor)}::uuid[],
      ${requesters.map(() => "Earned Leave")}::text[],
      ${requesters.map(() => timeOffTypeIds.get("EL")!)}::uuid[],
      ${requesters.map((_, i) => `2026-08-${String((i % 20) + 1).padStart(2, "0")}`)}::date[],
      ${requesters.map((_, i) => `2026-08-${String((i % 20) + 2).padStart(2, "0")}`)}::date[],
      ${requesters.map(() => money(2))}::numeric[],
      ${requesters.map((_, i) => (i % 5 === 0 ? "submitted" : i % 7 === 0 ? "refused" : "approved"))}::text[]::request_status[]
    ) as t(a, b, c, d, e, f, g)
  `;

  // ---- Payruns, payslips and lines ----
  let payslipTotal = 0;

  for (const period of periods) {
    const payrun = await one(sql`
      insert into payruns (
        organization_id, name, period_start, period_end, salary_structure_id, status, created_by
      )
      values (
        ${organizationId}, ${period.name}, ${period.start}, ${period.end},
        ${structure.id}, ${period.status}::payrun_status, ${target.id}
      )
      returning id
    `);

    await sql`
      insert into payrun_employees (payrun_id, employee_id)
      select ${payrun.id}::uuid, a from unnest(${activePeople.map(idFor)}::uuid[]) as t(a)
    `;

    const computed = activePeople.map((person) => {
      // A little month-to-month movement, so the trend line is not flat.
      const ratio = 0.94 + rand() * 0.1;
      return { person, ...payrollLines(person.wage, ratio) };
    });

    const payslipIds = new Map<string, string>();
    for (const batch of chunk(computed)) {
      const rows = (await sql`
        insert into payslips (
          payrun_id, employee_id, worked_days, leave_days, gross_pay, total_deductions, net_pay, status
        )
        select ${payrun.id}::uuid, a, b, c, d, e, f, ${period.status}::payrun_status from unnest(
          ${batch.map((c) => idFor(c.person))}::uuid[],
          ${batch.map(() => money(between(18, 22)))}::numeric[],
          ${batch.map(() => money(between(0, 3)))}::numeric[],
          ${batch.map((c) => money(c.gross))}::numeric[],
          ${batch.map((c) => money(c.deductions))}::numeric[],
          ${batch.map((c) => money(c.net))}::numeric[]
        ) as t(a, b, c, d, e, f)
        returning id, employee_id
      `) as { id: string; employee_id: string }[];

      for (const row of rows) payslipIds.set(row.employee_id, row.id);
      payslipTotal += rows.length;
    }

    type LineRow = { payslipId: string; name: string; code: string; category: string; sequence: number; amount: string };
    const lines: LineRow[] = [];
    for (const entry of computed) {
      const payslipId = payslipIds.get(idFor(entry.person));
      if (!payslipId) continue;
      for (const line of entry.lines) {
        lines.push({
          payslipId,
          name: line.name,
          code: line.code,
          category: line.category,
          sequence: line.sequence,
          amount: money(line.amount),
        });
      }
    }

    for (const batch of chunk(lines, 1000)) {
      await sql`
        insert into payslip_lines (payslip_id, name, code, category, sequence, amount)
        select a, b, c, d, e, f from unnest(
          ${batch.map((r) => r.payslipId)}::uuid[],
          ${batch.map((r) => r.name)}::text[],
          ${batch.map((r) => r.code)}::text[],
          ${batch.map((r) => r.category)}::text[]::salary_rule_category[],
          ${batch.map((r) => r.sequence)}::int[],
          ${batch.map((r) => r.amount)}::numeric[]
        ) as t(a, b, c, d, e, f)
      `;
    }

    // A couple of warnings on the open payrun, so the alert panel is not empty.
    if (period.status !== "paid") {
      const flagged = activePeople.filter((p) => !p.hasBank).slice(0, 4);
      if (flagged.length > 0) {
        await sql`
          insert into payroll_warnings (payrun_id, employee_id, code, message)
          select ${payrun.id}::uuid, a, 'MISSING_BANK_ACCOUNT', b from unnest(
            ${flagged.map(idFor)}::uuid[],
            ${flagged.map((p) => `${p.firstName} ${p.lastName} has no bank account on file.`)}::text[]
          ) as t(a, b)
        `;
      }
    }
  }

  // Counted back out of the database, not from the loop variables — a summary
  // built in JS would report success even if nothing was written.
  const [counts] = (await sql`
    select
      (select count(*) from employees where organization_id = ${organizationId})::int as employees,
      (select count(*) from employees where organization_id = ${organizationId} and status = 'active')::int as active,
      (select count(*) from departments where organization_id = ${organizationId})::int as departments,
      (select count(*) from contracts c
         join employees e on e.id = c.employee_id
        where e.organization_id = ${organizationId})::int as contracts,
      (select count(*) from attendance_records a
         join employees e on e.id = a.employee_id
        where e.organization_id = ${organizationId})::int as attendance,
      (select count(*) from payruns where organization_id = ${organizationId})::int as payruns,
      (select count(*) from payslips p
         join payruns r on r.id = p.payrun_id
        where r.organization_id = ${organizationId})::int as payslips
  `) as Record<string, number>[];

  console.log(
    [
      "",
      `In the database now (organization ${organizationId}):`,
      `  employees   ${counts.employees} (${counts.active} active)`,
      `  departments ${counts.departments}`,
      `  contracts   ${counts.contracts}`,
      `  attendance  ${counts.attendance}`,
      `  payruns     ${counts.payruns}`,
      `  payslips    ${counts.payslips}`,
      "",
    ].join("\n"),
  );

  if (counts.employees === 0) {
    throw new Error("Seed finished but no employees are present — nothing was written.");
  }

  console.log("Sign in at /login with:");
  console.log(`  email    ${target.email}`);
  console.log(
    createdLogin || passwordReset
      ? `  password ${demoAdminPassword}`
      : "  password (unchanged — pass SEED_ADMIN_PASSWORD=... to set one)",
  );
  console.log(
    createdLogin
      ? ""
      : `\nNote: data was attached to the existing workspace "${target.organization_name}".\n` +
          "If that is not the account you sign in with, the demo data will not be\n" +
          "visible. Re-run with SEED_ADMIN_EMAIL=<your admin email>.\n",
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
