// Print a client-hub link for a client email (support tool): pnpm tsx scripts/mint-hub-link.ts someone@example.com
import "dotenv/config";
import { businessId, db } from "../src/server/db";
import { env } from "../src/server/env";
import { mintToken } from "../src/server/tokens";

async function main() {
  const email = (process.argv[2] ?? "").toLowerCase();
  const c = await db.client.findFirstOrThrow({ where: { email } });
  console.log(`${env.appUrl}/hub/${await mintToken(db, await businessId(), "CLIENT_HUB", { clientId: c.id })}`);
}
main().finally(() => db.$disconnect());
