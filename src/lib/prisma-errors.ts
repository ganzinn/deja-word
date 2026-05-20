import { Prisma } from "@/generated/prisma/client";

export function isUniqueConstraintOn(e: unknown, model: string): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (e.code !== "P2002") return false;
  return (e.meta as { modelName?: string } | null)?.modelName === model;
}
