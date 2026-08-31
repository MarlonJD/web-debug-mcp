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
