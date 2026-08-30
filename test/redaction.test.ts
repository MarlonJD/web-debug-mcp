import { describe, expect, it } from "vitest";

import { boundText, redactText, redactValue, safeUrl } from "../src/core/redaction.js";

describe("redaction", () => {
  it("redacts sensitive URL parameters and bearer credentials", () => {
    expect(safeUrl("http://localhost:4173/?token=abc&view=checkout")).toContain("token=[REDACTED]");
    expect(safeUrl("http://localhost:4173/?token=abc&view=checkout")).toContain("view=checkout");
    expect(safeUrl("http://localhost:4173/?authorization=Bearer%20abc")).toContain("authorization=[REDACTED]");
  });

  it("redacts sensitive object keys without hiding ordinary identifiers", () => {
    expect(redactValue({ customerId: "c-1", accessToken: "secret", nested: { password: "pw" } })).toEqual({
      customerId: "c-1",
      accessToken: "[REDACTED]",
      nested: { password: "[REDACTED]" },
    });
  });

  it("redacts complete authorization and cookie header values", () => {
    const cases = [
      ["Authorization: Basic dXNlcjpwYXNz", "Authorization: [REDACTED]"],
      ['Proxy-Authorization: Digest username="user", nonce="n", response="secret"', "Proxy-Authorization: [REDACTED]"],
      ["Authorization: AWS4-HMAC-SHA256 Credential=key, SignedHeaders=host, Signature=secret", "Authorization: [REDACTED]"],
      ["Cookie: session=alpha; preference=dark", "Cookie: [REDACTED]"],
      ["Set-Cookie: session=alpha; Path=/; HttpOnly", "Set-Cookie: [REDACTED]"],
      ["Authorization: Digest first\r\n continuation=secret\r\nstatus=401", "Authorization: [REDACTED]\r\nstatus=401"],
    ] as const;

    for (const [input, expected] of cases) expect(redactText(input)).toBe(expected);
  });

  it("redacts quoted and whitespace-containing sensitive fields without consuming sibling fields", () => {
    const cases = [
      ['password="hello world"', 'password="[REDACTED]"'],
      ["api_key='a,b;c&d'", "api_key='[REDACTED]'"],
      ['{"password":"hello world","user":"marlon"}', '{"password":"[REDACTED]","user":"marlon"}'],
      [JSON.stringify({ message: 'password="hello world"' }), JSON.stringify({ message: 'password="[REDACTED]"' })],
      ["token=alpha beta view=checkout", "token=[REDACTED] view=checkout"],
      ["password=secret; status=401", "password=[REDACTED]; status=401"],
      ["private_key=secret&view=checkout", "private_key=[REDACTED]&view=checkout"],
      ["password=[REDACTED] hunter2", "password=[REDACTED]"],
      ["token = [REDACTED] real-secret", "token = [REDACTED]"],
      [String.raw`{\"password\":\"hello world\",\"user\":\"marlon\"}`, String.raw`{\"password\":\"[REDACTED]\",\"user\":\"marlon\"}`],
      [JSON.stringify({ message: 'password="alpha\nbeta"' }), JSON.stringify({ message: 'password="[REDACTED]"' })],
      [
        JSON.stringify({ message: String.raw`password="alpha \"quoted\" C:\temp"` }),
        JSON.stringify({ message: String.raw`password="[REDACTED]"` }),
      ],
    ] as const;

    for (const [input, expected] of cases) expect(redactText(input)).toBe(expected);
  });

  it("keeps unrelated lines outside empty and folded sensitive fields", () => {
    expect(redactText("Authorization:\r\nstatus=401")).toBe("Authorization:[REDACTED]\r\nstatus=401");
    expect(redactText("Cookie:\nview=checkout")).toBe("Cookie:[REDACTED]\nview=checkout");
    expect(redactText("password=\nview=checkout")).toBe("password=[REDACTED]\nview=checkout");
    expect(redactText("Authorization: Digest first\r\n continuation=secret\r\nstatus=401")).toBe("Authorization: [REDACTED]\r\nstatus=401");
  });

  it("keeps raw text aliases aligned with structured sensitive keys", () => {
    const cases = [
      ["session", "alpha beta"],
      ["authorizationHeader", "Basic dXNlcjpwYXNz"],
      ["password_hash", "alpha beta"],
    ] as const;
    for (const [key, value] of cases) {
      expect(redactText(`${key}=${value}`)).toBe(`${key}=[REDACTED]`);
      expect(redactValue({ [key]: value })).toEqual({ [key]: "[REDACTED]" });
    }
  });

  it("preserves ordinary prose, identifiers, and standalone base64", () => {
    const controls = [
      "authorization succeeded for customerId=c-1",
      "The password policy requires 12 characters",
      "view=checkout",
      "customerId=c-1",
      "dXNlcjpwYXNz",
    ];

    for (const input of controls) expect(redactText(input)).toBe(input);
  });

  it("bounds UTF-8 strings, keys, breadth, depth, and circular values", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const result = redactValue({
      text: "😀".repeat(10_000),
      ["k".repeat(1_000)]: "value",
      accessToken: "secret",
      entries: Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`item-${index}`, index])),
      circular,
    }) as Record<string, unknown>;

    expect(Buffer.byteLength(String(result.text))).toBeLessThanOrEqual(8_000);
    expect(Object.keys(result).every((key) => Buffer.byteLength(key) <= 200)).toBe(true);
    expect(result.accessToken).toBe("[REDACTED]");
    expect(Object.keys(result.entries as Record<string, unknown>)).toHaveLength(50);
    expect(JSON.stringify(result)).toContain("[CIRCULAR]");
  });

  it("prefix-bounds multi-megabyte text and URLs before redaction work", () => {
    const huge = `Bearer secret-token ${"x".repeat(4 * 1024 * 1024)}`;
    const bounded = boundText(huge, 120);
    expect(bounded).toContain("Bearer [REDACTED]");
    expect(bounded).toHaveLength(120);
    expect(bounded).toMatch(/… \[TRUNCATED\]$/);

    const url = safeUrl(`http://127.0.0.1:4173/?view=${"x".repeat(4 * 1024 * 1024)}&token=late-secret`);
    expect(url.length).toBeLessThanOrEqual(2_560);
    expect(url).not.toContain("late-secret");
  });
});
