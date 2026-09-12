import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is not set. Did you pass it when running this script?");
  process.exit(1);
}

async function main(): Promise<void> {
  const client = new Client({ connectionString });

  console.log("Connecting...");
  await client.connect();

  const result = await client.query<{ now: Date; version: string }>(
    "select now() as now, version() as version",
  );

  const row = result.rows[0];
  console.log("Connected successfully.");
  console.log("Database time :", row?.now);
  console.log("Server version:", row?.version);

  await client.end();
}

main().catch((error: unknown) => {
  console.error("Could not connect:", error);
  process.exit(1);
});