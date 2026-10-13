import type {
  BrowserRuntimeCapabilities,
  RuntimeCapability,
  RuntimeCapabilityProvenance,
} from "../domain/types.js";

function capability(
  state: RuntimeCapability["state"],
  provenance: RuntimeCapabilityProvenance[],
  reason?: string,
): RuntimeCapability {
  return { state, provenance: provenance.slice(0, 2), ...(reason ? { reason: reason.slice(0, 500) } : {}) };
}

export function chromiumRuntimeCapabilities(attached: boolean): BrowserRuntimeCapabilities {
  const cdp = capability("supported", ["playwright", "chromium-cdp"]);
  const launchOnly = attached
    ? capability("unsupported", ["session-policy"], "Attached Chromium targets cannot provide fresh isolated launch state.")
    : capability("supported", ["playwright", "session-policy"]);
  return {
    schemaVersion: 1,
    browser: "chromium",
    transport: attached ? "chromium-cdp-attach" : "chromium-launch",
    actions: cdp,
    locators: { css: cdp, semantic: cdp },
    dom: cdp,
    console: cdp,
    network: cdp,
    screenshots: cdp,
    javascriptDebugger: cdp,
    evaluation: cdp,
    accessibility: cdp,
    pageRuntimeEnrichment: cdp,
    viewportMatrix: launchOnly,
    tlsBypass: launchOnly,
    authSeeding: launchOnly,
    sourceMapping: capability("degraded", ["chromium-cdp"], "Only bounded maps for selected main-frame default-world scripts are resolved; missing or ambiguous mappings remain unavailable."),
    executionCoverage: cdp,
  };
}

export function safariRuntimeCapabilities(consoleAvailable: boolean, consoleDeliveryObserved: boolean): BrowserRuntimeCapabilities {
  const native = capability("supported", ["safari-mcp"]);
  const unavailable = (reason: string) => capability("unsupported", ["safari-mcp"], reason);
  return {
    schemaVersion: 1,
    browser: "safari",
    transport: "safari-mcp",
    actions: native,
    locators: {
      css: native,
      semantic: unavailable("Safari MCP supports exact CSS locators only."),
    },
    dom: native,
    console: consoleAvailable
      ? capability(consoleDeliveryObserved ? "supported" : "degraded", ["safari-mcp"], consoleDeliveryObserved ? undefined : "Safari Inspector console delivery has not been observed; an empty native buffer alone does not establish console availability.")
      : unavailable("Safari MCP Inspector console collection is unavailable."),
    network: capability(
      "degraded",
      ["safari-mcp", "performance-resource-timing"],
      "Safari network evidence may fall back to bounded Performance Resource Timing metadata when Inspector returns no requests.",
    ),
    screenshots: native,
    javascriptDebugger: unavailable("Safari MCP does not expose Chromium CDP debugger domains."),
    evaluation: capability("degraded", ["safari-mcp", "session-policy"], "Safari evaluation requires explicit side-effect authorization."),
    accessibility: unavailable("Computed accessibility diagnostics are unavailable in Safari MCP."),
    pageRuntimeEnrichment: unavailable("Framework runtime bridges are available only in Chromium development sessions."),
    viewportMatrix: unavailable("Safari MCP uses a visible non-isolated profile and cannot provide fresh viewport candidates."),
    tlsBypass: unavailable("Guarded loopback TLS bypass is unavailable in Safari MCP."),
    authSeeding: unavailable("Disposable auth-state seeding is unavailable in Safari MCP."),
    sourceMapping: unavailable("Source-map resolution requires Chromium CDP."),
    executionCoverage: unavailable("Precise execution coverage requires Chromium CDP."),
  };
}
