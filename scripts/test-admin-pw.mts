import { neon } from "@neondatabase/serverless";
import { pbkdf2Sync, timingSafeEqual } from "node:crypto";

const sql = neon(process.env.DATABASE_URL!);

function verifyPassword(value: string, storedHash: string | null) {
  if (!storedHash) return false;
  const [method, iterations, salt, stored] = storedHash.split("$");
  if (method !== "pbkdf2" || !iterations || !salt || !stored) return false;
  const computed = pbkdf2Sync(value, salt, Number(iterations), 64, "sha512").toString("hex");
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(stored, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function test() {
  const [admin] = await sql`select * from users where email = 'admin@peoplepay360.test'`;
  console.log("Admin user:", { id: admin.id, email: admin.email, role: admin.role, status: admin.status, mustChangePassword: admin.must_change_password });

  const candidates = [
    "DemoPass123!",
    "Password123!",
    "admin123",
    "AdminPass123!",
    "password",
    "admin",
    "PerfTest123!",
    "12345678",
    "PeoplePay123!"
  ];

  for (const c of candidates) {
    if (verifyPassword(c, admin.password_hash)) {
      console.log(`>>> MATCH FOR admin@peoplepay360.test: "${c}"`);
      return;
    }
  }
  console.log("No match found in candidates. Stored hash starts with:", admin.password_hash?.slice(0, 30));
}

test().catch(console.error);
