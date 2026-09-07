/**
 * Read-only: lists the admin accounts and their workspaces, with how many
 * employees each workspace holds. Use it to find which account to sign in as.
 *
 *   npm run db:admins
 */
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const sql = neon(databaseUrl);

const rows = (await sql`
  select
    u.email,
    u.role,
    u.status,
    u.must_change_password,
    o.id   as organization_id,
    o.name as organization_name,
    (select count(*) from employees e where e.organization_id = o.id)::int as employees,
    u.created_at
  from users u
  left join organizations o on o.id = u.organization_id
  where u.role = 'admin'
  order by u.created_at desc
`) as {
  email: string;
  role: string;
  status: string;
  must_change_password: boolean;
  organization_id: string | null;
  organization_name: string | null;
  employees: number;
  created_at: string;
}[];

if (rows.length === 0) {
  console.log("No admin users exist. Run `npm run db:seed:demo` to create one.");
} else {
  console.log(`\n${rows.length} admin account(s):\n`);
  for (const row of rows) {
    console.log(`  ${row.email}`);
    console.log(`    workspace  ${row.organization_name ?? "(none)"}`);
    console.log(`    employees  ${row.employees}`);
    console.log(
      `    status     ${row.status}${row.must_change_password ? " · must change password" : ""}`,
    );
    console.log("");
  }
  console.log("The workspace with 50 employees is the seeded one.\n");
}
