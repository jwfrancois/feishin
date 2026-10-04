// One-off: aggregate agent findings by kind/status/serverStatus + list pending/failed samples
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const rows = await db.agentFinding.groupBy({
    by: ["kind", "status", "serverStatus"],
    _count: { _all: true },
  });
  console.log("kind | status | serverStatus | count");
  for (const r of rows.sort((a, b) => a.kind.localeCompare(b.kind))) {
    console.log(`${r.kind} | ${r.status} | ${r.serverStatus} | ${r._count._all}`);
  }
  const pending = await db.agentFinding.findMany({
    where: { status: { in: ["found", "applied"] }, serverStatus: { not: "synced" } },
    select: { kind: true, itemName: true, serverError: true },
    take: 8,
    orderBy: { updatedAt: "desc" },
  });
  console.log("\nSample pending (latest):");
  for (const p of pending) console.log(` - ${p.kind} "${p.itemName}" ${p.serverError ? "err=" + p.serverError.slice(0, 80) : ""}`);
  const total = await db.agentFinding.count();
  console.log("\nTotal findings:", total);
}
main().finally(() => process.exit(0));
