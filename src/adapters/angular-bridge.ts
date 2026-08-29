/**
 * Development-only Angular bridge. It uses documented window.ng debug
 * globals and builds a bounded DOM-hosted tree without traversing private Ivy
 * arrays or invoking component methods, getters, signals, or injectors.
 */
export const ANGULAR_DEBUG_BRIDGE_SCRIPT = String.raw`(() => {
  if (window.__WEB_DEBUG_ANGULAR__) return;

  const MAX_COMPONENTS = 200;
  const MAX_ELEMENTS = 1_000;
  const MAX_DEPTH = 20;
  const MAX_KEYS = 30;
  const MAX_ARRAY = 20;
  const MAX_STRING = 500;
  const previousStates = new WeakMap();
  const sampleCounts = new WeakMap();
  let snapshotCount = 0;

  window.__WEB_DEBUG_ANGULAR__ = {
    snapshot() {
      const versionElement = document.querySelector("[ng-version]");
      const version = versionElement?.getAttribute("ng-version")?.slice(0, 100) ?? null;
      const ng = window.ng;
      if (!versionElement && !ng) return null;

      snapshotCount += 1;
      const warnings = [];
      if (!ng || typeof ng.getComponent !== "function") {
        warnings.push("Angular was detected, but documented development debug globals are unavailable; use a non-optimized development build.");
        return {
          detected: true,
          version,
          mode: "development",
          treeMode: "dom-host",
          snapshotCount,
          componentCount: 0,
          components: [],
          truncated: false,
          warnings,
        };
      }

      const elements = Array.from(document.querySelectorAll("*")).slice(0, MAX_ELEMENTS);
      const byInstance = new Map();
      const byHost = new Map();
      let truncated = document.querySelectorAll("*").length > MAX_ELEMENTS;

      for (const element of elements) {
        if (byInstance.size >= MAX_COMPONENTS) {
          truncated = true;
          break;
        }
        let component = null;
        try { component = ng.getComponent(element); } catch { component = null; }
        if (!component || (typeof component !== "object" && typeof component !== "function") || byInstance.has(component)) continue;

        const state = serializeRecord(component);
        const previous = previousStates.get(component) ?? null;
        const changedStateKeys = previous ? changedKeys(previous, state) : [];
        const sampleCount = (sampleCounts.get(component) ?? 0) + 1;
        previousStates.set(component, state);
        sampleCounts.set(component, sampleCount);

        const record = {
          instance: component,
          hostElement: element,
          node: {
            name: componentName(component),
            host: {
              tag: String(element.tagName || "").toLowerCase().slice(0, 100),
              id: typeof element.id === "string" && element.id ? element.id.slice(0, 300) : null,
            },
            state,
            sampleCount,
            changedStateKeys,
            children: [],
          },
        };
        byInstance.set(component, record);
        byHost.set(element, record);
      }

      const roots = [];
      for (const record of byInstance.values()) {
        let parent = record.hostElement?.parentElement ?? null;
        let parentRecord = null;
        let depth = 0;
        while (parent && depth < MAX_DEPTH) {
          parentRecord = byHost.get(parent) ?? null;
          if (parentRecord) break;
          parent = parent.parentElement;
          depth += 1;
        }
        if (parentRecord) parentRecord.node.children.push(record.node);
        else roots.push(record.node);
      }

      if (truncated) warnings.push("Angular component discovery was truncated to the bounded DOM/component limits.");
      return {
        detected: true,
        version,
        mode: "development",
        treeMode: "dom-host",
        snapshotCount,
        componentCount: byInstance.size,
        components: roots,
        truncated,
        warnings,
      };
    },
  };

  function componentName(component) {
    const value = component?.constructor?.name;
    return typeof value === "string" && value ? value.replace(/^_+/, "").slice(0, 200) : "Anonymous";
  }

  function serializeRecord(value) {
    const output = {};
    let keys = [];
    try { keys = Object.keys(value).slice(0, MAX_KEYS); } catch { return { value: "[UNAVAILABLE]" }; }
    for (const key of keys) {
      if (isFrameworkInternal(key)) continue;
      if (isSensitive(key)) { output[key] = "[REDACTED]"; continue; }
      let descriptor;
      try { descriptor = Object.getOwnPropertyDescriptor(value, key); } catch { descriptor = null; }
      if (!descriptor) { output[key] = "[UNAVAILABLE]"; continue; }
      if (!("value" in descriptor)) { output[key] = "[ACCESSOR]"; continue; }
      output[key] = serialize(descriptor.value, key, new Set(), 0);
    }
    return output;
  }

  function serialize(value, key, seen, depth) {
    if (key && isSensitive(key)) return "[REDACTED]";
    if (value === null || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "string") return value.slice(0, MAX_STRING);
    if (typeof value === "function") return "[Function]";
    if (typeof value !== "object") return String(value).slice(0, MAX_STRING);
    if (typeof Node !== "undefined" && value instanceof Node) return "[DOMNode]";
    if (depth >= 3) return "[TRUNCATED_OBJECT]";
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((item) => serialize(item, undefined, seen, depth + 1));
    const output = {};
    let keys = [];
    try { keys = Object.keys(value).slice(0, MAX_KEYS); } catch { return "[UNAVAILABLE]"; }
    for (const childKey of keys) {
      if (isFrameworkInternal(childKey)) continue;
      if (isSensitive(childKey)) { output[childKey] = "[REDACTED]"; continue; }
      let descriptor;
      try { descriptor = Object.getOwnPropertyDescriptor(value, childKey); } catch { descriptor = null; }
      if (!descriptor) { output[childKey] = "[UNAVAILABLE]"; continue; }
      if (!("value" in descriptor)) { output[childKey] = "[ACCESSOR]"; continue; }
      output[childKey] = serialize(descriptor.value, childKey, seen, depth + 1);
    }
    return output;
  }

  function changedKeys(previous, current) {
    const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
    const changed = [];
    for (const key of keys) {
      if (changed.length >= 20) break;
      if (signature(previous[key]) !== signature(current[key])) changed.push(key);
    }
    return changed;
  }

  function signature(value) {
    try { return JSON.stringify(value); } catch { return "[UNAVAILABLE]"; }
  }

  function isSensitive(key) {
    return /authorization|cookie|token|secret|password|api[-_]?key|session|csrf/i.test(key);
  }

  function isFrameworkInternal(key) {
    return /^__ng|^ɵ/.test(key);
  }
})();`;
