/**
 * Development-only Vue 3 bridge. It observes the upstream DevTools hook
 * contract and never falls back to DOM-private __vue* properties.
 */
export const VUE_DEBUG_BRIDGE_SCRIPT = String.raw`(() => {
  if (window.__WEB_DEBUG_VUE__) return;

  const MAX_APPS = 4;
  const MAX_COMPONENTS = 200;
  const MAX_DEPTH = 20;
  const MAX_KEYS = 30;
  const MAX_ARRAY = 20;
  const MAX_STRING = 500;
  const apps = new Map();
  const listeners = [];
  const warnings = [];
  let truncated = false;

  const existingHook = window.__VUE_DEVTOOLS_GLOBAL_HOOK__;
  let hook = existingHook;
  if (!hook) {
    const events = new Map();
    hook = {
      enabled: true,
      appRecords: [],
      on(event, handler) {
        const handlers = events.get(event) ?? new Set();
        handlers.add(handler);
        events.set(event, handlers);
      },
      once(event, handler) {
        const wrapped = (...args) => { hook.off(event, wrapped); handler(...args); };
        hook.on(event, wrapped);
      },
      off(event, handler) {
        if (!handler) events.delete(event);
        else events.get(event)?.delete(handler);
      },
      emit(event, ...args) {
        for (const handler of [...(events.get(event) ?? [])]) handler(...args);
      },
    };
    window.__VUE_DEVTOOLS_GLOBAL_HOOK__ = hook;
  }

  const canObserve = hook && typeof hook.on === "function" && typeof hook.off === "function";
  if (!canObserve) warnings.push("Vue DevTools hook exists but cannot be safely chained; runtime component evidence is unavailable.");

  if (canObserve) {
    listen("app:init", (app, version) => {
      if (!app) return;
      const existing = apps.get(app);
      if (existing) {
        existing.version = typeof version === "string" ? version.slice(0, 100) : existing.version;
        return;
      }
      if (apps.size >= MAX_APPS) { truncated = true; return; }
      apps.set(app, { app, version: typeof version === "string" ? version.slice(0, 100) : null, components: new Map() });
    });
    listen("app:unmount", (app) => { apps.delete(app); });
    listen("component:added", (app, uid, parentUid, component) => recordComponent(app, uid, parentUid, component, "mount"));
    listen("component:updated", (app, uid, parentUid, component) => recordComponent(app, uid, parentUid, component, "update"));
    listen("component:removed", (app, uid) => {
      const record = apps.get(app);
      record?.components.delete(uid);
    });
  }

  window.__WEB_DEBUG_VUE__ = {
    snapshot() {
      if (!canObserve) return { detected: true, version: null, appCount: 0, componentCount: 0, components: [], truncated: false, warnings: warnings.slice() };
      if (apps.size === 0) return { detected: true, version: null, appCount: 0, componentCount: 0, components: [], truncated: false, warnings: ["No Vue 3 development application was observed through the DevTools hook."] };
      const roots = [];
      let componentCount = 0;
      for (const appRecord of apps.values()) {
        const nodes = new Map();
        for (const record of appRecord.components.values()) {
          if (componentCount >= MAX_COMPONENTS) { truncated = true; break; }
          componentCount += 1;
          const props = serializeRecord(record.component?.props);
          const state = serializeState(record.component);
          const previousProps = record.previousProps;
          const previousState = record.previousState;
          const node = {
            name: componentName(record.component),
            source: componentSource(record.component),
            props,
            state,
            updateCount: record.updateCount,
            changedPropKeys: previousProps ? changedKeys(previousProps, props) : [],
            changedStateKeys: previousState ? changedKeys(previousState, state) : [],
            children: [],
          };
          record.previousProps = props;
          record.previousState = state;
          nodes.set(record.uid, { record, node });
        }
        for (const item of nodes.values()) {
          const parent = nodes.get(item.record.parentUid);
          if (parent && depthOf(item.record, nodes) <= MAX_DEPTH) parent.node.children.push(item.node);
          else roots.push(item.node);
        }
      }
      const version = [...apps.values()].map((record) => record.version).find(Boolean) ?? null;
      const snapshotWarnings = warnings.slice();
      if (truncated) snapshotWarnings.push("Vue runtime evidence was truncated to the bounded app/component limits.");
      return { detected: true, version, appCount: apps.size, componentCount, components: roots, truncated, warnings: snapshotWarnings };
    },
    dispose() {
      if (!canObserve) return;
      for (const [event, handler] of listeners.splice(0)) hook.off(event, handler);
      apps.clear();
    },
  };

  function listen(event, handler) {
    hook.on(event, handler);
    listeners.push([event, handler]);
  }

  function recordComponent(app, uid, parentUid, component, kind) {
    let appRecord = apps.get(app);
    if (!appRecord) {
      if (!app || apps.size >= MAX_APPS) { truncated = true; return; }
      appRecord = { app, version: null, components: new Map() };
      apps.set(app, appRecord);
    }
    if (appRecord.components.size >= MAX_COMPONENTS && !appRecord.components.has(uid)) { truncated = true; return; }
    const prior = appRecord.components.get(uid);
    appRecord.components.set(uid, {
      uid,
      parentUid,
      component,
      updateCount: (prior?.updateCount ?? 0) + (kind === "update" ? 1 : 0),
      previousProps: prior?.previousProps ?? null,
      previousState: prior?.previousState ?? null,
    });
  }

  function componentName(component) {
    const type = component?.type;
    const value = type?.name ?? type?.__name ?? fileName(type?.__file);
    return typeof value === "string" && value ? value.slice(0, 200) : "Anonymous";
  }

  function componentSource(component) {
    const file = component?.type?.__file;
    return typeof file === "string" && file ? { file: file.slice(0, MAX_STRING) } : null;
  }

  function fileName(file) {
    if (typeof file !== "string") return null;
    return file.split(/[\\/]/).pop()?.replace(/\.vue$/i, "") ?? null;
  }

  function depthOf(record, nodes) {
    let depth = 0;
    let current = nodes.get(record.parentUid)?.record ?? null;
    while (current && depth <= MAX_DEPTH) { depth += 1; current = nodes.get(current.parentUid)?.record ?? null; }
    return depth;
  }

  function serializeState(component) {
    const output = {};
    appendSection(output, "data", component?.data);
    appendSection(output, "setup", component?.setupState);
    appendSection(output, "exposed", component?.exposed);
    return output;
  }

  function appendSection(output, prefix, value) {
    if (!value || typeof value !== "object") return;
    let keys = [];
    try { keys = Object.keys(value).slice(0, MAX_KEYS); } catch { return; }
    for (const key of keys) {
      const resultKey = (prefix + "." + key).slice(0, 200);
      if (isSensitive(key)) { output[resultKey] = "[REDACTED]"; continue; }
      let descriptor;
      try { descriptor = Object.getOwnPropertyDescriptor(value, key); } catch { descriptor = null; }
      if (!descriptor) { output[resultKey] = "[UNAVAILABLE]"; continue; }
      if (!("value" in descriptor)) { output[resultKey] = "[ACCESSOR]"; continue; }
      output[resultKey] = serialize(descriptor.value, key, new Set(), 0);
    }
  }

  function serializeRecord(value) {
    if (!value || typeof value !== "object") return {};
    const output = {};
    let keys = [];
    try { keys = Object.keys(value).slice(0, MAX_KEYS); } catch { return output; }
    for (const key of keys) {
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
    if (value.__v_isRef === true) return "[VueRef]";
    if (typeof Node !== "undefined" && value instanceof Node) return "[DOMNode]";
    if (depth >= 3) return "[TRUNCATED_OBJECT]";
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((item) => serialize(item, undefined, seen, depth + 1));
    const output = {};
    let keys = [];
    try { keys = Object.keys(value).slice(0, MAX_KEYS); } catch { return "[UNAVAILABLE]"; }
    for (const childKey of keys) {
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
})();`;
