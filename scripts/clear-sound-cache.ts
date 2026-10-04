import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const del = await db.agentFinding.deleteMany({ where: { kind: "sound" } });
console.log("deleted sound findings:", del.count);
await db.$disconnect();
