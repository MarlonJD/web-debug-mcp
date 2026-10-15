import { describe, expect, it } from "vitest";

import {
  scenarioContractHash,
  sanitizeReplayAction,
  validateScenarioInput,
  type RecordScenarioInput,
} from "../src/core/scenario-contract.js";

function scenario(): RecordScenarioInput {
  return {
    sessionId: "00000000-0000-4000-8000-000000000001",
    name: "contract",
    url: "http://127.0.0.1:4173/?token=private",
    actions: [{ kind: "fill", locator: { kind: "css", value: "#secret" }, value: "private" }],
    failureSignature: [{ kind: "route", path: "/", expected: "pass" }],
    acceptanceChecks: [{ kind: "noConsoleErrors" }],
  };
}

describe("scenario contract helpers", () => {
  it("bounds completion and repetition and includes them in the immutable scenario hash", () => {
    const input = scenario();
    input.completion = { checks: [{ kind: "networkComplete", path: "/result", method: "GET" }], timeoutMs: 500, stableForMs: 50 };
    input.minimumPostFixAttempts = 3;
    expect(() => validateScenarioInput(input)).not.toThrow();
    const base = { ...input, tls: "strict" as const, authFixture: "none" as const };
    expect(scenarioContractHash(base)).not.toBe(scenarioContractHash({ ...base, minimumPostFixAttempts: 1 }));
    expect(scenarioContractHash(base)).not.toBe(scenarioContractHash({ ...base, completion: { ...input.completion, stableForMs: 100 } }));
    expect(() => validateScenarioInput({ ...input, minimumPostFixAttempts: 6 })).toThrow(/integer from 1 to 5/);
    expect(() => validateScenarioInput({ ...input, completion: { ...input.completion!, timeoutMs: 10 } })).toThrow(/Completion requires/);
  });
  it("validates bounded inputs and hashes the sanitized canonical contract deterministically", () => {
    const input = scenario();
    expect(() => validateScenarioInput(input)).not.toThrow();
    const options = { ...input, tls: "strict" as const, authFixture: "none" as const };
    expect(scenarioContractHash(options)).toBe(scenarioContractHash(options));
    expect(scenarioContractHash({ ...options, failureViewports: ["default"] })).not.toBe(scenarioContractHash(options));
    expect(sanitizeReplayAction(input.actions[0]!)).toMatchObject({ kind: "fill", value: "[REDACTED_REPLAY_INPUT]" });
  });

  it("rejects duplicate checkpoint boundaries before execution", () => {
    const input = scenario();
    input.checkpoints = [
      { name: "first", offset: 0, probes: [], route: "/" },
      { name: "second", offset: 0, probes: [], route: "/" },
    ];
    expect(() => validateScenarioInput(input)).toThrowError(/unique and strictly increasing/);
  });
});
