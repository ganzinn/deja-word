import { beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { truncateAll } = await import("./db");
const { seedSystemFixtures } = await import("./fixtures");

beforeEach(async () => {
  await truncateAll();
  await seedSystemFixtures();
});
