import { execSync } from "node:child_process";

export default async function globalSetup() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/dejaword_test(\?|$)/.test(url)) {
    throw new Error(
      `Refusing to run integration tests: DATABASE_URL must point to dejaword_test (got: ${url || "<unset>"})`,
    );
  }
  execSync("pnpm prisma migrate deploy", { stdio: "inherit" });
}
