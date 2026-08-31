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

export function chromiumRuntimeCapabilities(attached: boolean, webmcpAvailable?: boolean): BrowserRuntimeCapabilities {
  const cdp = capability("supported", ["playwright", "chromium-cdp"]);
  const launchOnly = attached
    ? capability("unsupported", ["session-policy"], "Attached Chromium targets cannot provide fresh isolated launch state.")
    : capability("supported", ["playwright", "session-policy"]);
  return {
    schemaVersion: 2,
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
    webmcp: webmcpAvailable === true
      ? capability("supported", ["webmcp-page-api"])
      : webmcpAvailable === false
        ? capability("unsupported", ["webmcp-page-api"], "The selected page did not expose a callable WebMCP API.")
        : capability("degraded", ["webmcp-page-api"], "WebMCP availability is negotiated from the selected page at startup."),
  };
}

export function safariRuntimeCapabilities(hasBidi: boolean): BrowserRuntimeCapabilities {
  const webdriver = capability("supported", ["safari-webdriver"]);
  const unavailable = (reason: string) => capability("unsupported", ["safari-webdriver"], reason);
  return {
    schemaVersion: 2,
    browser: "safari",
    transport: "safari-webdriver",
    actions: webdriver,
    locators: {
      css: webdriver,
      semantic: unavailable("Safari WebDriver supports exact CSS locators only."),
    },
    dom: webdriver,
    console: hasBidi
      ? capability("supported", ["safari-bidi"])
      : unavailable("Safari WebDriver BiDi console collection is unavailable."),
    network: capability(
      "degraded",
      hasBidi ? ["safari-bidi", "performance-resource-timing"] : ["performance-resource-timing"],
      "Safari network evidence may fall back to bounded Performance Resource Timing metadata when BiDi emits no events.",
    ),
    screenshots: webdriver,
    javascriptDebugger: unavailable("Safari WebDriver does not expose Chromium CDP debugger domains."),
    evaluation: capability("degraded", ["safari-webdriver", "session-policy"], "Safari evaluation requires explicit side-effect authorization."),
    accessibility: unavailable("Computed accessibility diagnostics are unavailable in Safari WebDriver."),
    pageRuntimeEnrichment: unavailable("Framework runtime bridges are available only in Chromium development sessions."),
    viewportMatrix: unavailable("Safari WebDriver uses a visible non-isolated profile and cannot provide fresh viewport candidates."),
    tlsBypass: unavailable("Guarded loopback TLS bypass is unavailable in Safari WebDriver."),
    authSeeding: unavailable("Disposable auth-state seeding is unavailable in Safari WebDriver."),
    webmcp: unavailable("WebMCP is a Chromium page API and is unavailable in Safari WebDriver."),
  };
}
