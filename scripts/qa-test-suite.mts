import { neon } from "@neondatabase/serverless";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL not set");
const sql = neon(databaseUrl);

class Session {
  cookie = "";
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  async request(method: string, path: string, body?: unknown) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(this.cookie ? { Cookie: this.cookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      const setCookie = response.headers.get("set-cookie");
      if (setCookie) {
        this.cookie = setCookie.split(";")[0];
      }

      const contentType = response.headers.get("content-type") ?? "";
      const payload = contentType.includes("application/json")
        ? await response.json().catch(() => null)
        : contentType.includes("pdf")
        ? `[Binary PDF, length: ${response.headers.get("content-length")}]`
        : await response.text().catch(() => null);

      return { ok: response.ok, status: response.status, payload, contentType };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, status: 0, payload: message, contentType: "" };
    }
  }

  async get(path: string) {
    return this.request("GET", path);
  }

  async post(path: string, body?: unknown) {
    return this.request("POST", path, body);
  }

  async login(email: string, password = "DemoPass123!") {
    const res = await this.post("/api/auth/login", { email, password });
    return res;
  }
}

type TestResult = {
  category: string;
  testName: string;
  role: string;
  status: number;
  ok: boolean;
  detail: string;
};

async function main() {
  console.log("==================================================");
  console.log("PEOPLEPAY360 ACCURATE QA & DEBUGGING PASS");
  console.log(`Target: ${baseUrl}`);
  console.log("==================================================\n");

  const orgId = "5cf9397f-43ca-440b-ad80-21278ef8fc25"; // Acme Manufacturing
  const results: TestResult[] = [];
  function record(category: string, testName: string, role: string, status: number, ok: boolean, detail = "") {
    results.push({ category, testName, role, status, ok, detail });
    const mark = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
    console.log(`[${category}] [${role}] ${testName} -> ${status} ${mark} ${detail ? `(${detail})` : ""}`);
  }

  // 1. Roles & Logins
  const roles = [
    { role: "admin", email: "admin@peoplepay360.test", pass: "Password123!" },
    { role: "hr_manager", email: "hr.manager@demo.peoplepay360.test", pass: "DemoPass123!" },
    { role: "payroll_user", email: "payroll.user@demo.peoplepay360.test", pass: "DemoPass123!" },
    { role: "payroll_manager", email: "payroll.manager@demo.peoplepay360.test", pass: "DemoPass123!" },
    { role: "employee", email: "employee@demo.peoplepay360.test", pass: "DemoPass123!" },
  ];

  const sessions: Record<string, Session> = {};

  console.log("--- AUTHENTICATION & SESSIONS ---");
  for (const r of roles) {
    const sess = new Session(r.role);
    const loginRes = await sess.login(r.email, r.pass);
    sessions[r.role] = sess;
    record("AUTH", `Login ${r.email}`, r.role, loginRes.status, loginRes.ok, loginRes.ok ? "Cookie acquired" : JSON.stringify(loginRes.payload));

    const meRes = await sess.get("/api/auth/me");
    record("AUTH", `/api/auth/me verification`, r.role, meRes.status, meRes.ok && meRes.payload?.data?.role === r.role, `role: ${meRes.payload?.data?.role}`);
  }

  // Get Acme-scoped reference IDs
  const [riya] = await sql`select id from employees where employee_code = 'PP360-0001' and organization_id = ${orgId}`;
  const [contract] = await sql`select id from contracts where employee_id = ${riya.id}`;
  const [payrun] = await sql`select id from payruns where organization_id = ${orgId} and status = 'computed' limit 1`;
  const [payslip] = await sql`select id from payslips where payrun_id = ${payrun.id} limit 1`;
  const [structure] = await sql`select id from salary_structures where organization_id = ${orgId} limit 1`;
  const [rule] = await sql`select id from salary_rules where structure_id = ${structure.id} limit 1`;

  console.log("\n--- WORKFORCE API ENDPOINTS (ADMIN & HR) ---");
  const workforceEndpoints = [
    ["GET", "/api/dashboard"],
    ["GET", "/api/departments"],
    ["GET", "/api/employees"],
    ["GET", `/api/employees/${riya.id}`],
    ["GET", "/api/contracts"],
    ["GET", `/api/contracts/${contract.id}`],
    ["GET", "/api/schedules"],
    ["GET", "/api/attendance"],
    ["GET", "/api/time-off"],
    ["GET", "/api/time-off-types"],
    ["GET", "/api/leave-allocations"],
    ["GET", "/api/leave-balances"],
    ["GET", "/api/bank-accounts"],
  ] as const;

  for (const [method, ep] of workforceEndpoints) {
    for (const testRole of ["admin", "hr_manager"]) {
      const sess = sessions[testRole];
      const res = await sess.get(ep);
      const isOk = res.ok && res.status === 200;
      record("WORKFORCE", `${method} ${ep}`, testRole, res.status, isOk, !isOk ? JSON.stringify(res.payload) : "");
    }
  }

  console.log("\n--- PAYROLL API ENDPOINTS (ADMIN, PAYROLL USER, PAYROLL MANAGER) ---");
  const payrollEndpoints = [
    ["GET", "/api/dashboard"],
    ["GET", "/api/payruns"],
    ["GET", `/api/payruns/${payrun.id}`],
    ["GET", `/api/payruns/${payrun.id}/employees`],
    ["GET", "/api/payruns/eligible-employees?periodStart=2026-08-01&periodEnd=2026-08-31"],
    ["GET", "/api/payslips"],
    ["GET", `/api/payslips/${payslip.id}`],
    ["GET", `/api/payslips/${payslip.id}/pdf`],
    ["GET", "/api/salary-structures"],
    ["GET", `/api/salary-structures/${structure.id}`],
    ["GET", "/api/salary-rules"],
    ["GET", `/api/salary-rules/${rule.id}`],
    ["GET", "/api/payroll-warnings"],
    ["GET", "/api/statutory-settings"],
  ] as const;

  for (const [method, ep] of payrollEndpoints) {
    for (const testRole of ["admin", "payroll_user", "payroll_manager"]) {
      const sess = sessions[testRole];
      const res = await sess.get(ep);
      // payroll_user is expected 403 on statutory-settings
      const expected = (testRole === "payroll_user" && ep === "/api/statutory-settings") ? 403 : 200;
      const isOk = res.status === expected;
      record("PAYROLL", `${method} ${ep}`, testRole, res.status, isOk, `status: ${res.status}`);
    }
  }

  console.log("\n--- PAYROLL COMPUTATION & LIFECYCLE TEST ---");
  // Test computing an open payrun
  const pmSess = sessions["payroll_manager"];
  const computeRes = await pmSess.post(`/api/payruns/${payrun.id}/compute`);
  record("PAYRUN_LIFECYCLE", `POST /api/payruns/${payrun.id}/compute`, "payroll_manager", computeRes.status, computeRes.ok, `status: ${computeRes.status}`);

  console.log("\n--- RBAC BOUNDARY TESTS (EMPLOYEE) ---");
  const empSess = sessions["employee"];
  const empBlocked = [
    ["GET", "/api/users"],
    ["GET", "/api/salary-structures"],
    ["GET", "/api/salary-rules"],
    ["GET", "/api/statutory-settings"],
    ["GET", "/api/audit-logs"],
    ["GET", "/api/payruns"],
  ] as const;

  for (const [method, ep] of empBlocked) {
    const res = await empSess.get(ep);
    const blocked = res.status === 403 || res.status === 401;
    record("RBAC_BLOCKED", `${method} ${ep}`, "employee", res.status, blocked, blocked ? "Correctly Blocked" : "SECURITY LEAK!");
  }

  console.log("\n--- RBAC BOUNDARY TESTS (HR MANAGER) ---");
  const hrSess = sessions["hr_manager"];
  const hrBlocked = [
    ["GET", "/api/salary-structures"],
    ["GET", "/api/salary-rules"],
    ["GET", "/api/payruns"],
    ["GET", "/api/payslips"],
  ] as const;

  for (const [method, ep] of hrBlocked) {
    const res = await hrSess.get(ep);
    const blocked = res.status === 403 || res.status === 401;
    record("RBAC_BLOCKED", `${method} ${ep}`, "hr_manager", res.status, blocked, blocked ? "Correctly Blocked" : "SECURITY LEAK!");
  }

  console.log("\n--- SUMMARY OF FAILING TESTS ---");
  const failures = results.filter((r) => !r.ok);
  if (failures.length === 0) {
    console.log("All tested API endpoints and RBAC boundaries passed! ✓");
  } else {
    console.table(failures);
  }
}

main().catch(console.error);
