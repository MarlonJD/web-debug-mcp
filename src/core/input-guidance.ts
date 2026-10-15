import { z } from "zod";

type Schema = Record<string, unknown>;
const SESSION = "00000000-0000-4000-8000-000000000001";
const LOCATOR = { kind: "css", value: "#status" };

/** Static values only: guidance must never contain rejected caller input. */
export function inputExample(name: string, schema: z.ZodType): Record<string, unknown> {
  const document = z.toJSONSchema(schema, { io: "input" }) as Schema;
  const generated = exampleFor(document, document) as Record<string, unknown>;
  const recipe = name === "web_repro_record" ? {
    ...generated,
    name: "Submit result",
    actions: [{ kind: "click", locator: { kind: "css", value: "#submit" } }],
    failureSignature: [{ kind: "locatorText", locator: LOCATOR, text: "Saved", expected: "fail" }],
    acceptanceChecks: [{ kind: "locatorText", locator: LOCATOR, text: "Saved" }],
  } : name === "web_next_inspect" ? { ...generated, inspection: { kind: "compileRoute", path: "/" } } : generated;
  // Fail at registration if a canonical schema changes incompatibly with its recipe.
  schema.parse(recipe);
  return recipe;
}

export function inputGuidance(schema: z.ZodType, example: Record<string, unknown>, error: z.ZodError) {
  const document = z.toJSONSchema(schema, { io: "input" }) as Schema;
  return {
    instruction: "No operation ran. Correct the listed fields using this schema-valid example; replace static session, URL and locator values with observed ones. Failure signatures are flat checks with expected=pass|fail; acceptance checks omit expected.",
    fields: Object.keys(properties(document, document)).slice(0, 24),
    issues: error.issues.slice(0, 8).map(issue => {
      let nodes = [document];
      let path = "arguments";
      for (const segment of issue.path.slice(0, 8)) {
        if (typeof segment === "number") {
          nodes = nodes.flatMap(node => alternatives(node, document).map(branch => branch.items).filter(isSchema));
          path += `[${Math.max(0, Math.min(100, segment))}]`;
        } else {
          const next = nodes.flatMap(node => alternatives(node, document).map(branch => properties(branch, document)[String(segment)]).filter(isSchema));
          // Unknown field names can themselves be private data. Never echo them.
          if (!next.length) { path += ".[unknown-field]"; nodes = []; break; }
          path += `.${String(segment)}`;
          nodes = next;
        }
      }
      const branches = nodes.flatMap(node => alternatives(node, document));
      const fields = [...new Set(branches.flatMap(node => Object.keys(properties(node, document))))].slice(0, 24);
      const choices = [...new Set(branches.flatMap(node => "const" in node ? [node.const] : Array.isArray(node.enum) ? node.enum : []))].slice(0, 20);
      const variants = [...new Set(branches.flatMap(node => {
        const kind = properties(node, document).kind;
        return isSchema(kind) && typeof kind.const === "string" ? [kind.const] : [];
      }))].slice(0, 20);
      const constraints = branches.slice(0, 4).map(node => Object.fromEntries(
        ["type", "format", "minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"].filter(key => key in node).map(key => [key, node[key]]),
      )).filter(node => Object.keys(node).length);
      return { path, code: issue.code, ...(fields.length ? { fields } : {}), ...(choices.length ? { choices } : {}), ...(variants.length ? { variants } : {}), ...(constraints.length ? { constraints } : {}) };
    }),
    ...(error.issues.length > 8 ? { omittedIssues: error.issues.length - 8 } : {}),
    example,
  };
}

function isSchema(value: unknown): value is Schema { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

function dereference(node: Schema, root: Schema): Schema {
  if (typeof node.$ref !== "string") return node;
  if (!node.$ref.startsWith("#/")) throw new Error("Input guidance requires local schema references.");
  let value: unknown = root;
  for (const part of node.$ref.slice(2).split("/")) value = isSchema(value) ? value[part.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined;
  if (!isSchema(value)) throw new Error("Input guidance encountered an unresolved schema reference.");
  return value;
}

function alternatives(node: Schema, root: Schema): Schema[] {
  node = dereference(node, root);
  const branches = node.anyOf ?? node.oneOf;
  return Array.isArray(branches) ? branches.filter(isSchema).flatMap(branch => alternatives(branch, root)) : [node];
}

function properties(node: Schema, root: Schema): Record<string, Schema> {
  node = dereference(node, root);
  return isSchema(node.properties) ? node.properties as Record<string, Schema> : {};
}

function exampleFor(node: Schema, root: Schema, key = "", depth = 0): unknown {
  if (depth > 12) throw new Error("Input example exceeded its schema depth bound.");
  node = dereference(node, root);
  if ("const" in node) return node.const;
  if (Array.isArray(node.enum)) return node.enum[0];
  if ("default" in node) return node.default;
  const branches = node.anyOf ?? node.oneOf;
  if (Array.isArray(branches) && isSchema(branches[0])) return exampleFor(branches[0], root, key, depth + 1);
  if (node.type === "object") {
    const fields = properties(node, root);
    const required = Array.isArray(node.required) ? node.required : [];
    return Object.fromEntries(required.filter(field => typeof field === "string").map(field => [field, exampleFor(fields[field as string]!, root, String(field), depth + 1)]));
  }
  if (node.type === "array") return Array.from({ length: Number(node.minItems ?? 0) }, () => exampleFor(node.items as Schema, root, key, depth + 1));
  if (node.type === "boolean") return false;
  if (node.type === "number" || node.type === "integer") return Number(node.minimum ?? 0);
  if (node.type === "null") return null;
  if (node.type === "string") {
    if (node.format === "uuid") return SESSION;
    if (node.format === "uri" || node.format === "url" || key === "url") return "http://127.0.0.1:4173/";
    if (key === "evidenceRef") return `web-debug://evidence/${SESSION}`;
    if (["path", "route", "routeSpecifier"].includes(key)) return "/";
    return "example".padEnd(Number(node.minLength ?? 0), "x");
  }
  throw new Error(`Input example cannot represent schema type ${String(node.type)}.`);
}
