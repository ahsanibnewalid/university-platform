import { PrismaClient } from "@prisma/client";

const prismaGlobal = globalThis as typeof globalThis & {
  campusHubPrisma?: PrismaClient;
};

export const prisma =
  prismaGlobal.campusHubPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  prismaGlobal.campusHubPrisma = prisma;
}
