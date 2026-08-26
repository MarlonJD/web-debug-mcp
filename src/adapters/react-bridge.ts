/**
 * Development-only page bridge injected before application scripts run.
 * It observes React's public DevTools hook and exposes a bounded snapshot
 * contract for ReactAdapter without exposing arbitrary page globals.
 */
export const REACT_DEBUG_BRIDGE_SCRIPT = String.raw`(() => {
  if (window.__WEB_DEBUG_REACT__) return;

  const componentTags = new Set([0, 1, 2, 11, 14, 15]);
  const roots = new Set();
  const renderCounts = new WeakMap();
  const previousProps = new WeakMap();
  const previousHooks = new WeakMap();
  const renderCauses = new WeakMap();
  const actualDurations = new WeakMap();
  const commitSummaries = [];
  const renderers = new Map();
  const existingHook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__ ?? {};
  const previousInject = typeof existingHook.inject === "function" ? existingHook.inject.bind(existingHook) : null;
  const previousCommit = typeof existingHook.onCommitFiberRoot === "function" ? existingHook.onCommitFiberRoot.bind(existingHook) : null;
  const previousUnmount = typeof existingHook.onCommitFiberUnmount === "function" ? existingHook.onCommitFiberUnmount.bind(existingHook) : null;
  let nextRendererId = 1;
  let commitCount = 0;

  existingHook.supportsFiber = true;
  existingHook.renderers = existingHook.renderers ?? new Map();
  existingHook.inject = (renderer) => {
    const id = previousInject ? previousInject(renderer) : nextRendererId++;
    renderers.set(id, renderer);
    existingHook.renderers.set(id, renderer);
    return id;
  };
  existingHook.onCommitFiberRoot = (rendererId, root, ...rest) => {
    if (root) roots.add(root);
    commitCount += 1;
    const stats = recordRenderTree(root?.current);
    commitSummaries.push({
      index: commitCount,
      timestamp: Date.now(),
      rendererId: Number.isInteger(rendererId) ? rendererId : null,
      componentCount: stats.componentCount,
      changedComponentCount: stats.changedComponentCount,
      durationMs: stats.durationMs,
    });
    if (commitSummaries.length > 50) commitSummaries.shift();
    previousCommit?.(rendererId, root, ...rest);
  };
  existingHook.onCommitFiberUnmount = (rendererId, fiber, ...rest) => {
    previousUnmount?.(rendererId, fiber, ...rest);
  };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = existingHook;

  window.__WEB_DEBUG_REACT__ = {
    snapshot() {
      const warnings = [];
      const components = [];
      let componentCount = 0;

      for (const root of roots) {
        const nodes = collectChildren(root.current, 0);
        components.push(...nodes);
      }
      if (roots.size === 0) warnings.push("No committed React root was observed yet.");

      return {
        detected: true,
        rendererCount: renderers.size,
        commitCount,
        commits: commitSummaries.slice(),
        components,
        warnings,
      };

      function collectChildren(fiber, depth) {
        if (!fiber || depth > 20 || componentCount >= 200) return [];
        const nodes = [];
        for (let child = fiber.child; child; child = child.sibling) {
          if (componentCount >= 200) break;
          const descendants = collectChildren(child, depth + 1);
          if (componentTags.has(child.tag)) {
            componentCount += 1;
            nodes.push({
              name: componentName(child),
              source: sourceLocation(child),
              props: serialize(child.memoizedProps, undefined, new Set(), 0),
              hooks: hookValues(child),
              renderCount: renderCounts.get(child) ?? 0,
              renderCause: renderCauses.get(child) ?? "parent",
              actualDurationMs: actualDurations.get(child) ?? null,
              children: descendants,
            });
          } else {
            nodes.push(...descendants);
          }
        }
        return nodes;
      }
    },
  };

  function recordRenderTree(rootFiber) {
    const stack = rootFiber ? [rootFiber] : [];
    const seen = new Set();
    let componentCount = 0;
    let changedComponentCount = 0;
    while (stack.length > 0) {
      const fiber = stack.pop();
      if (!fiber || seen.has(fiber)) continue;
      seen.add(fiber);
      if (componentTags.has(fiber.tag)) {
        componentCount += 1;
        const propsSignature = valueSignature(fiber.memoizedProps);
        const hooksSignature = valueSignature(hookValues(fiber));
        const previousFiber = previousProps.has(fiber)
          ? fiber
          : fiber.alternate && previousProps.has(fiber.alternate)
            ? fiber.alternate
            : null;
        const hasPrevious = previousFiber !== null;
        const propsChanged = hasPrevious && previousProps.get(previousFiber) !== propsSignature;
        const hooksChanged = hasPrevious && previousHooks.get(previousFiber) !== hooksSignature;
        const renderCause = !hasPrevious
          ? "mount"
          : propsChanged && hooksChanged
            ? "props+state"
            : propsChanged
              ? "props"
              : hooksChanged
                ? "state"
                : "parent";
        const renderCount = (renderCounts.get(fiber) ?? renderCounts.get(previousFiber) ?? 0) + 1;
        previousProps.set(fiber, propsSignature);
        previousHooks.set(fiber, hooksSignature);
        renderCauses.set(fiber, renderCause);
        renderCounts.set(fiber, renderCount);
        if (fiber.alternate) {
          previousProps.set(fiber.alternate, propsSignature);
          previousHooks.set(fiber.alternate, hooksSignature);
          renderCauses.set(fiber.alternate, renderCause);
          renderCounts.set(fiber.alternate, renderCount);
        }
        if (renderCause !== "parent") changedComponentCount += 1;
        const actualDuration = Number(fiber.actualDuration);
        actualDurations.set(fiber, Number.isFinite(actualDuration) ? Number(actualDuration.toFixed(3)) : null);
      }
      if (fiber.child) stack.push(fiber.child);
      if (fiber.sibling) stack.push(fiber.sibling);
    }
    const actualRootDuration = Number(rootFiber?.actualDuration);
    return {
      componentCount,
      changedComponentCount,
      durationMs: Number.isFinite(actualRootDuration) ? Number(actualRootDuration.toFixed(3)) : null,
    };
  }

  function componentName(fiber) {
    const type = fiber.elementType ?? fiber.type;
    if (typeof type === "function") return type.displayName ?? type.name ?? "Anonymous";
    if (type && typeof type === "object") return type.displayName ?? type.render?.displayName ?? "Anonymous";
    return "Anonymous";
  }

  function sourceLocation(fiber) {
    const source = fiber._debugSource;
    if (!source?.fileName || !Number.isInteger(source.lineNumber)) return null;
    return {
      file: source.fileName,
      line: source.lineNumber,
      column: Number.isInteger(source.columnNumber) ? source.columnNumber : 0,
    };
  }

  function hookValues(fiber) {
    const values = [];
    let hook = fiber.memoizedState;
    while (hook && values.length < 20) {
      values.push(serialize(hook.memoizedState, undefined, new Set(), 0));
      hook = hook.next;
    }
    return values;
  }

  function valueSignature(value) {
    try {
      return JSON.stringify(serialize(value, undefined, new Set(), 0)) ?? "undefined";
    } catch {
      return "[UNAVAILABLE]";
    }
  }

  function serialize(value, key, seen, depth) {
    if (key && /authorization|cookie|token|secret|password|api[-_]?key|session|csrf/i.test(key)) return "[REDACTED]";
    if (value === null || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "string") return value.slice(0, 500);
    if (typeof value === "function") return "[Function]";
    if (typeof value !== "object") return String(value);
    if (depth >= 3) return "[TRUNCATED_OBJECT]";
    if (seen.has(value)) return "[CIRCULAR]";
    if (value.$$typeof) return "[ReactElement]";
    seen.add(value);
    if (Array.isArray(value)) return value.slice(0, 20).map((item) => serialize(item, undefined, seen, depth + 1));
    const output = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, 30)) {
      output[childKey] = serialize(childValue, childKey, seen, depth + 1);
    }
    return output;
  }
})();`;
