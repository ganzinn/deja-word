import { NextRequest } from "next/server";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("better-auth/cookies", () => ({
  getSessionCookie: vi.fn(),
}));

const { getSessionCookie } = await import("better-auth/cookies");
const mockedGetSessionCookie = vi.mocked(getSessionCookie);

const { proxy, config } = await import("@/proxy");

function makeRequest(pathWithSearch: string): NextRequest {
  return new NextRequest(new URL(pathWithSearch, "http://localhost:3000"));
}

afterEach(() => {
  mockedGetSessionCookie.mockReset();
});

describe("proxy", () => {
  test("redirects to /sign-in with redirect query when no session cookie", () => {
    mockedGetSessionCookie.mockReturnValue(null);
    const res = proxy(makeRequest("/dashboard"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    const url = new URL(location!);
    expect(url.pathname).toBe("/sign-in");
    expect(url.searchParams.get("redirect")).toBe("/dashboard");
  });

  test("preserves the original pathname AND query string in the redirect param", () => {
    mockedGetSessionCookie.mockReturnValue(null);
    const res = proxy(makeRequest("/words?q=foo&page=2"));
    expect(res.status).toBe(307);
    const url = new URL(res.headers.get("location")!);
    expect(url.searchParams.get("redirect")).toBe("/words?q=foo&page=2");
  });

  test("passes through (NextResponse.next) when a session cookie is present", () => {
    mockedGetSessionCookie.mockReturnValue("any-non-empty-cookie");
    const res = proxy(makeRequest("/dashboard"));
    // NextResponse.next() yields a response with x-middleware-next: 1
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.status).toBe(200);
  });

  test("config.matcher protects /dashboard/:path* and /words/:path*", () => {
    expect(config.matcher).toEqual(["/dashboard/:path*", "/words/:path*"]);
  });
});
