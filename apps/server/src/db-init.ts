import { ensureSchema, pool } from "./db.js";

async function main() {
  await ensureSchema();
  console.log("Database schema ready.");
  await pool.end();
}

main().catch(async (error) => {
  console.error("Failed to initialize database:", error);
  await pool.end();
  process.exit(1);
});
