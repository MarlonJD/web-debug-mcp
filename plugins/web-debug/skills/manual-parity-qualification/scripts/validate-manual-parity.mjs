#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_ITEMS = 500;
const MAX_ERRORS = 1000;
const MAX_STRING = 2000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const REVIEW_STATES = new Set(["candidate", "approved", "rejected"]);
const SOURCE_KINDS = new Set(["manual", "prd", "role-matrix", "api-contract", "state-model", "existing-test", "incident", "exploration"]);
const CASE_KINDS = new Set(["golden", "atomic", "manual"]);
const CAMPAIGN_KINDS = new Set(["golden", "atomic"]);
const FACETS = new Set(["visible-ui", "api-readback", "domain-state", "history", "audit", "outbox", "privacy", "human-witness"]);
const EXECUTION_CLASSES = new Set(["ui-required", "api-only", "contract-only", "manual-only"]);
const COVERAGE_STATES = new Set(["full", "partial", "manual-only", "unsupported"]);
const EXECUTION_STATES = new Set(["passed", "failed", "inconclusive", "blocked", "not-run"]);
const STABILITY_STATES = new Set(["clean", "flaky", "unknown"]);
const MUTATION_KINDS = new Set(["read-only", "mutating"]);
const MUTATION_CERTAINTY = new Set(["confirmed", "ambiguous", "not-applicable"]);
const ARTIFACT_KINDS = new Set(["screenshot", "trace", "log", "report"]);

const errors = [];
let errorsTruncated = false;

function issue(path, message) {
  if (errors.length < MAX_ERRORS - 1) errors.push({ path: String(path).slice(0, 300), message: String(message).slice(0, 500) });
  else errorsTruncated = true;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactObject(value, path, fields) {
  if (!isRecord(value)) {
    issue(path, "must be an object");
    return {};
  }
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) issue(`${path}.${key}`, "is not a recognized field; executable actions and extensions require a new schema version");
  }
  for (const key of fields) {
    if (!(key in value)) issue(`${path}.${key}`, "is required");
  }
  return value;
}

function boundedArray(value, path, { min = 0, max = MAX_ITEMS } = {}) {
  if (!Array.isArray(value)) {
    issue(path, "must be an array");
    return [];
  }
  if (value.length < min || value.length > max) issue(path, `must contain ${min}..${max} items`);
  return value.slice(0, max);
}

function boundedString(value, path, { min = 1, max = MAX_STRING, nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string") {
    issue(path, nullable ? "must be a string or null" : "must be a string");
    return "";
  }
  if (value.length < min || value.length > max) issue(path, `must contain ${min}..${max} characters`);
  return value;
}

function identifier(value, path, { nullable = false } = {}) {
  const result = boundedString(value, path, { min: 1, max: 128, nullable });
  if (result !== null && result !== "" && !ID_PATTERN.test(result)) issue(path, "must use only letters, digits, '.', '_', ':', or '-' and start with a letter or digit");
  return result;
}

function digest(value, path, { nullable = false } = {}) {
  const result = boundedString(value, path, { min: 64, max: 64, nullable });
  if (result !== null && result !== "" && !SHA256_PATTERN.test(result)) issue(path, "must be a lowercase SHA-256 hex value");
  return result;
}

function enumValue(value, path, allowed) {
  const result = boundedString(value, path, { min: 1, max: 80 });
  if (result && !allowed.has(result)) issue(path, `must be one of: ${[...allowed].join(", ")}`);
  return result;
}

function isoTimestamp(value, path, { nullable = false } = {}) {
  const result = boundedString(value, path, { min: 1, max: 80, nullable });
  if (result !== null && result !== "" && Number.isNaN(Date.parse(result))) issue(path, "must be an ISO-compatible timestamp");
  return result;
}

function booleanValue(value, path) {
  if (typeof value !== "boolean") {
    issue(path, "must be a boolean");
    return false;
  }
  return value;
}

function integerValue(value, path) {
  if (!Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    issue(path, "must be a non-negative safe integer");
    return 0;
  }
  return value;
}

function uniqueStringArray(value, path, { allowed, min = 0 } = {}) {
  const items = boundedArray(value, path, { min });
  const result = [];
  const seen = new Set();
  items.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    const text = allowed ? enumValue(item, itemPath, allowed) : identifier(item, itemPath);
    if (!text) return;
    if (seen.has(text)) issue(itemPath, `duplicates '${text}'`);
    else {
      seen.add(text);
      result.push(text);
    }
  });
  return result;
}

function sameMembers(left, right) {
  return left.length === right.length && left.every((item) => right.includes(item));
}

function countStates(values, states) {
  return Object.fromEntries(states.map(([outputKey, state]) => [outputKey, values.filter((value) => value === state).length]));
}

function combineExecution(values) {
  for (const state of ["failed", "inconclusive", "blocked", "not-run", "passed"]) {
    if (values.includes(state)) return state;
  }
  return "not-run";
}

function combineStability(values) {
  if (values.includes("flaky")) return "flaky";
  if (values.includes("unknown")) return "unknown";
  return values.length > 0 && values.every((value) => value === "clean") ? "clean" : "unknown";
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateReview(value, path) {
  const review = exactObject(value, path, ["status", "reviewedBy", "reviewedAt", "note"]);
  const status = enumValue(review.status, `${path}.status`, REVIEW_STATES);
  const reviewedBy = boundedString(review.reviewedBy, `${path}.reviewedBy`, { min: 1, max: 300, nullable: true });
  const reviewedAt = isoTimestamp(review.reviewedAt, `${path}.reviewedAt`, { nullable: true });
  const note = boundedString(review.note, `${path}.note`, { min: 1, max: 1000, nullable: true });
  if ((status === "approved" || status === "rejected") && (!reviewedBy || !reviewedAt)) issue(path, `${status} review requires reviewedBy and reviewedAt`);
  if (status === "candidate" && (reviewedBy || reviewedAt)) issue(path, "candidate review cannot claim a completed reviewer or timestamp");
  if (status === "rejected" && !note) issue(`${path}.note`, "rejected review requires a reason");
  return { status, reviewedBy, reviewedAt, note };
}

function addUnique(map, id, value, path) {
  if (!id) return;
  if (map.has(id)) issue(path, `duplicates '${id}'`);
  else map.set(id, value);
}

function validateQualification(input) {
  const root = exactObject(input, "qualification", ["schemaVersion", "qualificationId", "baseline", "sources", "actors", "nativeTests", "requirements", "manualCases", "campaigns"]);
  if (root.schemaVersion !== 1) issue("qualification.schemaVersion", "must equal 1");
  const qualificationId = identifier(root.qualificationId, "qualification.qualificationId");

  const baselineObject = exactObject(root.baseline, "qualification.baseline", ["id", "digest", "review"]);
  const baseline = {
    id: identifier(baselineObject.id, "qualification.baseline.id"),
    digest: digest(baselineObject.digest, "qualification.baseline.digest"),
    review: validateReview(baselineObject.review, "qualification.baseline.review"),
  };

  const sources = new Map();
  boundedArray(root.sources, "qualification.sources", { min: 1 }).forEach((value, index) => {
    const path = `qualification.sources[${index}]`;
    const item = exactObject(value, path, ["id", "kind", "revision", "digest", "location"]);
    const parsed = {
      id: identifier(item.id, `${path}.id`),
      kind: enumValue(item.kind, `${path}.kind`, SOURCE_KINDS),
      revision: boundedString(item.revision, `${path}.revision`, { min: 1, max: 300 }),
      digest: digest(item.digest, `${path}.digest`, { nullable: true }),
      location: boundedString(item.location, `${path}.location`, { min: 1, max: 1000 }),
    };
    addUnique(sources, parsed.id, parsed, `${path}.id`);
  });

  const actors = new Map();
  boundedArray(root.actors, "qualification.actors", { min: 1 }).forEach((value, index) => {
    const path = `qualification.actors[${index}]`;
    const item = exactObject(value, path, ["id", "purpose"]);
    const parsed = {
      id: identifier(item.id, `${path}.id`),
      purpose: boundedString(item.purpose, `${path}.purpose`, { min: 1, max: 1000 }),
    };
    addUnique(actors, parsed.id, parsed, `${path}.id`);
  });

  const nativeTests = new Map();
  boundedArray(root.nativeTests, "qualification.nativeTests").forEach((value, index) => {
    const path = `qualification.nativeTests[${index}]`;
    const item = exactObject(value, path, ["id", "ref"]);
    const parsed = {
      id: identifier(item.id, `${path}.id`),
      ref: boundedString(item.ref, `${path}.ref`, { min: 1, max: 1000 }),
    };
    addUnique(nativeTests, parsed.id, parsed, `${path}.id`);
  });

  const requirements = new Map();
  boundedArray(root.requirements, "qualification.requirements", { min: 1 }).forEach((value, index) => {
    const path = `qualification.requirements[${index}]`;
    const item = exactObject(value, path, ["id", "title", "sourceIds", "ownerCaseId", "review", "reason", "requiredFacets", "mutation"]);
    const mutationObject = exactObject(item.mutation, `${path}.mutation`, ["kind", "receiptRequired"]);
    const parsed = {
      id: identifier(item.id, `${path}.id`),
      title: boundedString(item.title, `${path}.title`, { min: 1, max: 1000 }),
      sourceIds: uniqueStringArray(item.sourceIds, `${path}.sourceIds`, { min: 1 }),
      ownerCaseId: identifier(item.ownerCaseId, `${path}.ownerCaseId`, { nullable: true }),
      review: enumValue(item.review, `${path}.review`, REVIEW_STATES),
      reason: boundedString(item.reason, `${path}.reason`, { min: 1, max: 1000, nullable: true }),
      requiredFacets: uniqueStringArray(item.requiredFacets, `${path}.requiredFacets`, { allowed: FACETS, min: 1 }),
      mutation: {
        kind: enumValue(mutationObject.kind, `${path}.mutation.kind`, MUTATION_KINDS),
        receiptRequired: booleanValue(mutationObject.receiptRequired, `${path}.mutation.receiptRequired`),
      },
    };
    if (parsed.review === "rejected" && !parsed.reason) issue(`${path}.reason`, "rejected requirement requires a reason");
    if (parsed.review !== "rejected" && !parsed.ownerCaseId) issue(`${path}.ownerCaseId`, "non-rejected requirement requires one canonical owning manual case");
    if (parsed.review === "approved" && baseline.review.status !== "approved") issue(`${path}.review`, "an approved requirement requires an approved baseline");
    if (parsed.mutation.kind === "read-only" && parsed.mutation.receiptRequired) issue(`${path}.mutation.receiptRequired`, "read-only requirements cannot require a mutation receipt");
    addUnique(requirements, parsed.id, parsed, `${path}.id`);
  });

  const manualCases = new Map();
  boundedArray(root.manualCases, "qualification.manualCases", { min: 1 }).forEach((value, index) => {
    const path = `qualification.manualCases[${index}]`;
    const item = exactObject(value, path, ["id", "title", "sourceIds", "requirementIds", "actorIds", "kind"]);
    const parsed = {
      id: identifier(item.id, `${path}.id`),
      title: boundedString(item.title, `${path}.title`, { min: 1, max: 1000 }),
      sourceIds: uniqueStringArray(item.sourceIds, `${path}.sourceIds`, { min: 1 }),
      requirementIds: uniqueStringArray(item.requirementIds, `${path}.requirementIds`, { min: 1 }),
      actorIds: uniqueStringArray(item.actorIds, `${path}.actorIds`, { min: 1 }),
      kind: enumValue(item.kind, `${path}.kind`, CASE_KINDS),
    };
    addUnique(manualCases, parsed.id, parsed, `${path}.id`);
  });

  const campaigns = new Map();
  boundedArray(root.campaigns, "qualification.campaigns").forEach((value, index) => {
    const path = `qualification.campaigns[${index}]`;
    const item = exactObject(value, path, ["id", "kind", "orderedCaseIds", "nativeTestIds"]);
    const parsed = {
      id: identifier(item.id, `${path}.id`),
      kind: enumValue(item.kind, `${path}.kind`, CAMPAIGN_KINDS),
      orderedCaseIds: uniqueStringArray(item.orderedCaseIds, `${path}.orderedCaseIds`, { min: 1 }),
      nativeTestIds: uniqueStringArray(item.nativeTestIds, `${path}.nativeTestIds`, { min: 1 }),
    };
    addUnique(campaigns, parsed.id, parsed, `${path}.id`);
  });

  for (const requirement of requirements.values()) {
    requirement.sourceIds.forEach((id) => { if (!sources.has(id)) issue(`qualification.requirements.${requirement.id}.sourceIds`, `references unknown source '${id}'`); });
    if (requirement.ownerCaseId && !manualCases.has(requirement.ownerCaseId)) issue(`qualification.requirements.${requirement.id}.ownerCaseId`, `references unknown manual case '${requirement.ownerCaseId}'`);
  }
  for (const manualCase of manualCases.values()) {
    manualCase.sourceIds.forEach((id) => { if (!sources.has(id)) issue(`qualification.manualCases.${manualCase.id}.sourceIds`, `references unknown source '${id}'`); });
    manualCase.requirementIds.forEach((id) => { if (!requirements.has(id)) issue(`qualification.manualCases.${manualCase.id}.requirementIds`, `references unknown requirement '${id}'`); });
    manualCase.actorIds.forEach((id) => { if (!actors.has(id)) issue(`qualification.manualCases.${manualCase.id}.actorIds`, `references unknown actor '${id}'`); });
  }
  for (const requirement of requirements.values()) {
    if (requirement.ownerCaseId && !manualCases.get(requirement.ownerCaseId)?.requirementIds.includes(requirement.id)) {
      issue(`qualification.requirements.${requirement.id}.ownerCaseId`, "owning manual case must link the requirement");
    }
  }

  const campaignedCases = new Set();
  for (const campaign of campaigns.values()) {
    campaign.orderedCaseIds.forEach((id) => {
      const manualCase = manualCases.get(id);
      if (!manualCase) issue(`qualification.campaigns.${campaign.id}.orderedCaseIds`, `references unknown manual case '${id}'`);
      else if (manualCase.kind !== campaign.kind) issue(`qualification.campaigns.${campaign.id}.orderedCaseIds`, `case '${id}' is '${manualCase.kind}', not '${campaign.kind}'`);
      campaignedCases.add(id);
    });
    campaign.nativeTestIds.forEach((id) => { if (!nativeTests.has(id)) issue(`qualification.campaigns.${campaign.id}.nativeTestIds`, `references unknown native test '${id}'`); });
  }
  for (const manualCase of manualCases.values()) {
    if (manualCase.kind !== "manual" && !campaignedCases.has(manualCase.id)) issue(`qualification.manualCases.${manualCase.id}`, "golden and atomic cases must belong to a campaign");
  }

  return { qualificationId, baseline, sources, actors, nativeTests, requirements, manualCases, campaigns };
}

function validateCrosswalk(input, qualification, expectedQualificationDigest) {
  const root = exactObject(input, "crosswalk", ["schemaVersion", "qualificationId", "qualificationDigest", "baselineDigest", "rows"]);
  if (root.schemaVersion !== 1) issue("crosswalk.schemaVersion", "must equal 1");
  const qualificationId = identifier(root.qualificationId, "crosswalk.qualificationId");
  const qualificationDigest = digest(root.qualificationDigest, "crosswalk.qualificationDigest");
  const baselineDigest = digest(root.baselineDigest, "crosswalk.baselineDigest");
  if (qualificationId && qualification.qualificationId && qualificationId !== qualification.qualificationId) issue("crosswalk.qualificationId", "must match qualification.json");
  if (qualificationDigest && qualificationDigest !== expectedQualificationDigest) issue("crosswalk.qualificationDigest", "must equal the SHA-256 of the exact qualification.json bytes");
  if (baselineDigest && qualification.baseline.digest && baselineDigest !== qualification.baseline.digest) issue("crosswalk.baselineDigest", "must match qualification baseline digest");

  const rows = new Map();
  boundedArray(root.rows, "crosswalk.rows", { min: 1 }).forEach((value, index) => {
    const path = `crosswalk.rows[${index}]`;
    const item = exactObject(value, path, ["manualCaseId", "requirementIds", "nativeTestIds", "executionClass", "coverage", "requiredFacets", "reason"]);
    const parsed = {
      manualCaseId: identifier(item.manualCaseId, `${path}.manualCaseId`),
      requirementIds: uniqueStringArray(item.requirementIds, `${path}.requirementIds`, { min: 1 }),
      nativeTestIds: uniqueStringArray(item.nativeTestIds, `${path}.nativeTestIds`),
      executionClass: enumValue(item.executionClass, `${path}.executionClass`, EXECUTION_CLASSES),
      coverage: enumValue(item.coverage, `${path}.coverage`, COVERAGE_STATES),
      requiredFacets: uniqueStringArray(item.requiredFacets, `${path}.requiredFacets`, { allowed: FACETS, min: 1 }),
      reason: boundedString(item.reason, `${path}.reason`, { min: 1, max: 1000, nullable: true }),
    };
    if (parsed.coverage !== "full" && !parsed.reason) issue(`${path}.reason`, `${parsed.coverage || "non-full"} coverage requires a reason`);
    if (parsed.coverage === "full" && parsed.reason) issue(`${path}.reason`, "full coverage must use null reason");
    if (parsed.coverage === "full" && parsed.nativeTestIds.length === 0) issue(`${path}.nativeTestIds`, "full coverage requires at least one native test");
    if (parsed.executionClass === "ui-required" && !parsed.requiredFacets.includes("visible-ui")) issue(`${path}.requiredFacets`, "ui-required coverage requires visible-ui");
    if ((parsed.executionClass === "api-only" || parsed.executionClass === "contract-only") && parsed.requiredFacets.includes("visible-ui")) issue(`${path}.requiredFacets`, `${parsed.executionClass} coverage cannot claim visible-ui parity`);
    if ((parsed.coverage === "manual-only") !== (parsed.executionClass === "manual-only")) issue(path, "manual-only coverage and executionClass must be used together");
    if (parsed.executionClass === "manual-only" && !parsed.requiredFacets.includes("human-witness")) issue(`${path}.requiredFacets`, "manual-only coverage requires human-witness");
    addUnique(rows, parsed.manualCaseId, parsed, `${path}.manualCaseId`);
  });

  for (const manualCase of qualification.manualCases.values()) {
    const row = rows.get(manualCase.id);
    if (!row) {
      issue("crosswalk.rows", `missing manual case '${manualCase.id}'`);
      continue;
    }
    if (!sameMembers(row.requirementIds, manualCase.requirementIds)) issue(`crosswalk.rows.${manualCase.id}.requirementIds`, "must exactly match qualification manual case requirements");
    row.requirementIds.forEach((id) => { if (!qualification.requirements.has(id)) issue(`crosswalk.rows.${manualCase.id}.requirementIds`, `references unknown requirement '${id}'`); });
    row.nativeTestIds.forEach((id) => { if (!qualification.nativeTests.has(id)) issue(`crosswalk.rows.${manualCase.id}.nativeTestIds`, `references unknown native test '${id}'`); });
    const required = new Set(row.requirementIds.flatMap((id) => qualification.requirements.get(id)?.requiredFacets ?? []));
    for (const facet of required) {
      if (!row.requiredFacets.includes(facet)) issue(`crosswalk.rows.${manualCase.id}.requiredFacets`, `must include requirement facet '${facet}'`);
    }
  }
  for (const rowId of rows.keys()) {
    if (!qualification.manualCases.has(rowId)) issue(`crosswalk.rows.${rowId}.manualCaseId`, "references an unknown manual case");
  }
  const nativeTestOwners = new Map();
  for (const row of rows.values()) {
    for (const nativeTestId of row.nativeTestIds) {
      const previousOwner = nativeTestOwners.get(nativeTestId);
      if (previousOwner && previousOwner !== row.manualCaseId) issue(`crosswalk.rows.${row.manualCaseId}.nativeTestIds`, `native test '${nativeTestId}' is already owned by manual case '${previousOwner}'`);
      else nativeTestOwners.set(nativeTestId, row.manualCaseId);
    }
  }
  for (const campaign of qualification.campaigns.values()) {
    const expectedNativeTests = [...new Set(campaign.orderedCaseIds.flatMap((caseId) => rows.get(caseId)?.nativeTestIds ?? []))];
    if (!sameMembers(campaign.nativeTestIds, expectedNativeTests)) issue(`qualification.campaigns.${campaign.id}.nativeTestIds`, "must exactly equal the union of its ordered manual cases' crosswalk tests");
  }

  const baselineApproved = qualification.baseline.review.status === "approved";
  const requirementsApproved = [...qualification.requirements.values()].filter((item) => item.review !== "rejected").every((item) => item.review === "approved");
  const coverageReady = [...qualification.manualCases.values()].every((manualCase) => {
    const row = rows.get(manualCase.id);
    return row?.coverage === "full" || row?.coverage === "manual-only";
  });
  const ready = baselineApproved && requirementsApproved && coverageReady && rows.size === qualification.manualCases.size;
  return { qualificationId, qualificationDigest, baselineDigest, rows, ready, baselineApproved, requirementsApproved, coverageReady };
}

function validateEvidence(value, path) {
  const item = exactObject(value, path, ["kind", "ref", "digest"]);
  return {
    kind: enumValue(item.kind, `${path}.kind`, FACETS),
    ref: boundedString(item.ref, `${path}.ref`, { min: 1, max: 1000 }),
    digest: digest(item.digest, `${path}.digest`, { nullable: true }),
  };
}

function validateArtifact(value, path) {
  const item = exactObject(value, path, ["kind", "ref", "digest"]);
  return {
    kind: enumValue(item.kind, `${path}.kind`, ARTIFACT_KINDS),
    ref: boundedString(item.ref, `${path}.ref`, { min: 1, max: 1000 }),
    digest: digest(item.digest, `${path}.digest`, { nullable: true }),
  };
}

function validateManualReview(value, path) {
  if (value === null) return null;
  const item = exactObject(value, path, ["reviewer", "reviewedAt", "note"]);
  return {
    reviewer: boundedString(item.reviewer, `${path}.reviewer`, { min: 1, max: 300 }),
    reviewedAt: isoTimestamp(item.reviewedAt, `${path}.reviewedAt`),
    note: boundedString(item.note, `${path}.note`, { min: 1, max: 1000 }),
  };
}

function validateMutationEvidence(value, path) {
  if (value === null) return null;
  const item = exactObject(value, path, ["executionNamespace", "correlationId", "objectRef", "expectedRevision", "receiptRef", "receiptDigest", "idempotencyKeyDigest"]);
  return {
    executionNamespace: identifier(item.executionNamespace, `${path}.executionNamespace`),
    correlationId: boundedString(item.correlationId, `${path}.correlationId`, { min: 1, max: 500 }),
    objectRef: boundedString(item.objectRef, `${path}.objectRef`, { min: 1, max: 500 }),
    expectedRevision: boundedString(item.expectedRevision, `${path}.expectedRevision`, { min: 1, max: 300, nullable: true }),
    receiptRef: boundedString(item.receiptRef, `${path}.receiptRef`, { min: 1, max: 1000 }),
    receiptDigest: digest(item.receiptDigest, `${path}.receiptDigest`),
    idempotencyKeyDigest: digest(item.idempotencyKeyDigest, `${path}.idempotencyKeyDigest`, { nullable: true }),
  };
}

function validateSummary(value, path) {
  const item = exactObject(value, path, ["verdict", "requirements", "manualCases", "stability"]);
  const validateExecutionCounts = (countsValue, countsPath) => {
    const counts = exactObject(countsValue, countsPath, ["passed", "failed", "inconclusive", "blocked", "notRun"]);
    return {
      passed: integerValue(counts.passed, `${countsPath}.passed`),
      failed: integerValue(counts.failed, `${countsPath}.failed`),
      inconclusive: integerValue(counts.inconclusive, `${countsPath}.inconclusive`),
      blocked: integerValue(counts.blocked, `${countsPath}.blocked`),
      notRun: integerValue(counts.notRun, `${countsPath}.notRun`),
    };
  };
  const stabilityObject = exactObject(item.stability, `${path}.stability`, ["clean", "flaky", "unknown"]);
  return {
    verdict: enumValue(item.verdict, `${path}.verdict`, EXECUTION_STATES),
    requirements: validateExecutionCounts(item.requirements, `${path}.requirements`),
    manualCases: validateExecutionCounts(item.manualCases, `${path}.manualCases`),
    stability: {
      clean: integerValue(stabilityObject.clean, `${path}.stability.clean`),
      flaky: integerValue(stabilityObject.flaky, `${path}.stability.flaky`),
      unknown: integerValue(stabilityObject.unknown, `${path}.stability.unknown`),
    },
  };
}

function validateRun(input, qualification, crosswalk, expectedQualificationDigest, expectedCrosswalkDigest) {
  const root = exactObject(input, "runRecord", ["schemaVersion", "qualificationId", "qualificationDigest", "baselineDigest", "crosswalkDigest", "run", "results", "summary"]);
  if (root.schemaVersion !== 1) issue("runRecord.schemaVersion", "must equal 1");
  const qualificationId = identifier(root.qualificationId, "runRecord.qualificationId");
  const qualificationDigest = digest(root.qualificationDigest, "runRecord.qualificationDigest");
  const baselineDigest = digest(root.baselineDigest, "runRecord.baselineDigest");
  const crosswalkDigest = digest(root.crosswalkDigest, "runRecord.crosswalkDigest");
  if (qualificationId && qualificationId !== qualification.qualificationId) issue("runRecord.qualificationId", "must match qualification.json");
  if (qualificationDigest && qualificationDigest !== expectedQualificationDigest) issue("runRecord.qualificationDigest", "must equal the SHA-256 of the exact qualification.json bytes");
  if (baselineDigest && baselineDigest !== qualification.baseline.digest) issue("runRecord.baselineDigest", "must match qualification baseline digest");
  if (crosswalkDigest && crosswalkDigest !== expectedCrosswalkDigest) issue("runRecord.crosswalkDigest", "must equal the SHA-256 of the exact crosswalk.json bytes");

  const runObject = exactObject(root.run, "runRecord.run", ["id", "repositoryRevision", "targetProfile", "datasetId", "executionNamespace", "runner", "startedAt", "completedAt"]);
  const runnerObject = exactObject(runObject.runner, "runRecord.run.runner", ["name", "version", "command"]);
  const run = {
    id: identifier(runObject.id, "runRecord.run.id"),
    repositoryRevision: boundedString(runObject.repositoryRevision, "runRecord.run.repositoryRevision", { min: 1, max: 300 }),
    targetProfile: identifier(runObject.targetProfile, "runRecord.run.targetProfile"),
    datasetId: identifier(runObject.datasetId, "runRecord.run.datasetId"),
    executionNamespace: identifier(runObject.executionNamespace, "runRecord.run.executionNamespace"),
    runner: {
      name: boundedString(runnerObject.name, "runRecord.run.runner.name", { min: 1, max: 200 }),
      version: boundedString(runnerObject.version, "runRecord.run.runner.version", { min: 1, max: 200 }),
      command: boundedString(runnerObject.command, "runRecord.run.runner.command", { min: 1, max: 1000 }),
    },
    startedAt: isoTimestamp(runObject.startedAt, "runRecord.run.startedAt"),
    completedAt: isoTimestamp(runObject.completedAt, "runRecord.run.completedAt"),
  };
  if (run.startedAt && run.completedAt && Date.parse(run.completedAt) < Date.parse(run.startedAt)) issue("runRecord.run.completedAt", "must not precede startedAt");

  const caseResults = new Map();
  let passEligible = true;
  boundedArray(root.results, "runRecord.results", { min: 1 }).forEach((value, index) => {
    const path = `runRecord.results[${index}]`;
    const item = exactObject(value, path, ["manualCaseId", "nativeTestIds", "execution", "stability", "requirements", "diagnostics", "artifacts"]);
    const diagnosticsObject = exactObject(item.diagnostics, `${path}.diagnostics`, ["webDebugRefs"]);
    const requirementResults = new Map();
    boundedArray(item.requirements, `${path}.requirements`).forEach((requirementValue, requirementIndex) => {
      const requirementPath = `${path}.requirements[${requirementIndex}]`;
      const requirementObject = exactObject(requirementValue, requirementPath, ["requirementId", "execution", "stability", "observedFacets", "mutationCertainty", "mutationEvidence", "manualReview"]);
      const parsedRequirement = {
        requirementId: identifier(requirementObject.requirementId, `${requirementPath}.requirementId`),
        execution: enumValue(requirementObject.execution, `${requirementPath}.execution`, EXECUTION_STATES),
        stability: enumValue(requirementObject.stability, `${requirementPath}.stability`, STABILITY_STATES),
        observedFacets: boundedArray(requirementObject.observedFacets, `${requirementPath}.observedFacets`).map((entry, facetIndex) => validateEvidence(entry, `${requirementPath}.observedFacets[${facetIndex}]`)),
        mutationCertainty: enumValue(requirementObject.mutationCertainty, `${requirementPath}.mutationCertainty`, MUTATION_CERTAINTY),
        mutationEvidence: validateMutationEvidence(requirementObject.mutationEvidence, `${requirementPath}.mutationEvidence`),
        manualReview: validateManualReview(requirementObject.manualReview, `${requirementPath}.manualReview`),
      };
      addUnique(requirementResults, parsedRequirement.requirementId, parsedRequirement, `${requirementPath}.requirementId`);
    });
    const parsed = {
      manualCaseId: identifier(item.manualCaseId, `${path}.manualCaseId`),
      nativeTestIds: uniqueStringArray(item.nativeTestIds, `${path}.nativeTestIds`),
      execution: enumValue(item.execution, `${path}.execution`, EXECUTION_STATES),
      stability: enumValue(item.stability, `${path}.stability`, STABILITY_STATES),
      requirements: requirementResults,
      diagnostics: {
        webDebugRefs: boundedArray(diagnosticsObject.webDebugRefs, `${path}.diagnostics.webDebugRefs`).map((entry, refIndex) => boundedString(entry, `${path}.diagnostics.webDebugRefs[${refIndex}]`, { min: 1, max: 1000 })),
      },
      artifacts: boundedArray(item.artifacts, `${path}.artifacts`).map((entry, artifactIndex) => validateArtifact(entry, `${path}.artifacts[${artifactIndex}]`)),
    };
    addUnique(caseResults, parsed.manualCaseId, parsed, `${path}.manualCaseId`);
  });

  const computedCaseExecutions = new Map();
  const computedCaseStability = new Map();
  for (const manualCase of qualification.manualCases.values()) {
    const caseResult = caseResults.get(manualCase.id);
    const row = crosswalk.rows.get(manualCase.id);
    if (!caseResult) {
      issue("runRecord.results", `missing manual case '${manualCase.id}'`);
      computedCaseExecutions.set(manualCase.id, "not-run");
      computedCaseStability.set(manualCase.id, "unknown");
      passEligible = false;
      continue;
    }
    if (row && !sameMembers(caseResult.nativeTestIds, row.nativeTestIds)) issue(`runRecord.results.${manualCase.id}.nativeTestIds`, "must exactly match this crosswalk row's native tests");
    caseResult.nativeTestIds.forEach((id) => {
      if (!qualification.nativeTests.has(id)) issue(`runRecord.results.${manualCase.id}.nativeTestIds`, `references unknown native test '${id}'`);
      else if (!row?.nativeTestIds.includes(id)) issue(`runRecord.results.${manualCase.id}.nativeTestIds`, `native test '${id}' is not owned by this manual case row`);
    });

    const includedRequirementIds = manualCase.requirementIds.filter((id) => qualification.requirements.get(id)?.review !== "rejected");
    const childExecutions = [];
    const childStability = [];
    let caseEligible = true;
    for (const requirementId of includedRequirementIds) {
      const requirement = qualification.requirements.get(requirementId);
      const result = caseResult.requirements.get(requirementId);
      if (!requirement || !result) {
        issue(`runRecord.results.${manualCase.id}.requirements`, `missing non-rejected requirement '${requirementId}'`);
        childExecutions.push("not-run");
        childStability.push("unknown");
        caseEligible = false;
        passEligible = false;
        continue;
      }
      childExecutions.push(result.execution);
      childStability.push(result.stability);
      const requiredFacets = new Set([...(requirement.requiredFacets ?? []), ...(row?.requiredFacets ?? [])]);
      const observedFacets = new Set(result.observedFacets.map((facet) => facet.kind));
      if (result.execution === "passed") {
        if (qualification.baseline.review.status !== "approved" || requirement.review !== "approved") {
          issue(`runRecord.results.${manualCase.id}.requirements.${requirementId}.execution`, "candidate or rejected work cannot receive qualification PASS");
          caseEligible = false;
          passEligible = false;
        }
        for (const facet of requiredFacets) {
          if (!observedFacets.has(facet)) {
            issue(`runRecord.results.${manualCase.id}.requirements.${requirementId}.observedFacets`, `passed result is missing required facet '${facet}'`);
            caseEligible = false;
            passEligible = false;
          }
        }
        if (row?.executionClass === "manual-only") {
          if (!result.manualReview) {
            issue(`runRecord.results.${manualCase.id}.requirements.${requirementId}.manualReview`, "manual-only PASS requires a named and timestamped manual review");
            caseEligible = false;
            passEligible = false;
          }
        } else if (caseResult.nativeTestIds.length === 0) {
          issue(`runRecord.results.${manualCase.id}.nativeTestIds`, "automated PASS requires this case's linked native test");
          caseEligible = false;
          passEligible = false;
        }
        if (requirement.mutation.kind === "mutating" && requirement.mutation.receiptRequired && (result.mutationCertainty !== "confirmed" || !result.mutationEvidence)) {
          issue(`runRecord.results.${manualCase.id}.requirements.${requirementId}.mutationEvidence`, "receipt-required mutating PASS needs confirmed evidence bound to this execution namespace");
          caseEligible = false;
          passEligible = false;
        }
      }
      if (result.mutationCertainty === "ambiguous" && result.execution !== "inconclusive") {
        issue(`runRecord.results.${manualCase.id}.requirements.${requirementId}.execution`, "ambiguous mutation certainty forces inconclusive execution");
        caseEligible = false;
        passEligible = false;
      }
      if (requirement.mutation.kind === "read-only") {
        if (result.mutationCertainty !== "not-applicable") issue(`runRecord.results.${manualCase.id}.requirements.${requirementId}.mutationCertainty`, "read-only requirements must use not-applicable mutation certainty");
        if (result.mutationEvidence !== null) issue(`runRecord.results.${manualCase.id}.requirements.${requirementId}.mutationEvidence`, "read-only requirements must not carry mutation evidence");
      } else {
        if (result.mutationCertainty === "not-applicable" && result.execution !== "blocked" && result.execution !== "not-run") issue(`runRecord.results.${manualCase.id}.requirements.${requirementId}.mutationCertainty`, "attempted mutating requirements must report confirmed or ambiguous certainty");
        if (result.mutationCertainty === "confirmed" && !result.mutationEvidence) issue(`runRecord.results.${manualCase.id}.requirements.${requirementId}.mutationEvidence`, "confirmed mutation certainty requires mutation evidence");
        if (result.mutationEvidence && result.mutationEvidence.executionNamespace !== run.executionNamespace) issue(`runRecord.results.${manualCase.id}.requirements.${requirementId}.mutationEvidence.executionNamespace`, "must match run.executionNamespace");
      }
    }
    for (const requirementId of caseResult.requirements.keys()) {
      if (!manualCase.requirementIds.includes(requirementId)) issue(`runRecord.results.${manualCase.id}.requirements.${requirementId}`, "is not linked to this manual case");
      else if (qualification.requirements.get(requirementId)?.review === "rejected") issue(`runRecord.results.${manualCase.id}.requirements.${requirementId}`, "rejected requirements must not contribute a result");
    }

    const expectedStability = combineStability(childStability);
    let expectedExecution = combineExecution(childExecutions);
    if (expectedExecution === "passed" && (expectedStability !== "clean" || !caseEligible || !(row?.coverage === "full" || row?.coverage === "manual-only"))) expectedExecution = "inconclusive";
    if (caseResult.execution !== expectedExecution) issue(`runRecord.results.${manualCase.id}.execution`, `must equal computed case execution '${expectedExecution}'`);
    if (caseResult.stability !== expectedStability) issue(`runRecord.results.${manualCase.id}.stability`, `must equal computed case stability '${expectedStability}'`);
    computedCaseExecutions.set(manualCase.id, expectedExecution);
    computedCaseStability.set(manualCase.id, expectedStability);
  }
  for (const caseId of caseResults.keys()) {
    if (!qualification.manualCases.has(caseId)) issue(`runRecord.results.${caseId}.manualCaseId`, "references an unknown manual case");
  }

  const includedRequirements = [...qualification.requirements.values()].filter((item) => item.review !== "rejected");
  const canonicalRequirementResults = includedRequirements.map((requirement) => caseResults.get(requirement.ownerCaseId)?.requirements.get(requirement.id));
  const requirementExecutions = canonicalRequirementResults.map((result) => result?.execution ?? "not-run");
  const requirementStability = canonicalRequirementResults.map((result) => result?.stability ?? "unknown");
  const caseExecutions = [...qualification.manualCases.keys()].map((id) => computedCaseExecutions.get(id) ?? "not-run");

  const hasFailed = requirementExecutions.includes("failed") || caseExecutions.includes("failed");
  const hasInconclusive = requirementExecutions.includes("inconclusive") || caseExecutions.includes("inconclusive");
  const hasBlocked = requirementExecutions.includes("blocked") || caseExecutions.includes("blocked");
  const hasNotRun = requirementExecutions.includes("not-run") || caseExecutions.includes("not-run");
  const unstable = requirementStability.some((state) => state !== "clean");
  let verdict = "passed";
  if (hasFailed) verdict = "failed";
  else if (hasInconclusive) verdict = "inconclusive";
  else if (hasBlocked) verdict = "blocked";
  else if (hasNotRun) verdict = "not-run";
  else if (!crosswalk.ready || !passEligible || unstable) verdict = "inconclusive";

  const computedSummary = {
    verdict,
    requirements: countStates(requirementExecutions, [["passed", "passed"], ["failed", "failed"], ["inconclusive", "inconclusive"], ["blocked", "blocked"], ["notRun", "not-run"]]),
    manualCases: countStates(caseExecutions, [["passed", "passed"], ["failed", "failed"], ["inconclusive", "inconclusive"], ["blocked", "blocked"], ["notRun", "not-run"]]),
    stability: countStates(requirementStability, [["clean", "clean"], ["flaky", "flaky"], ["unknown", "unknown"]]),
  };
  const storedSummary = validateSummary(root.summary, "runRecord.summary");
  if (!deepEqual(storedSummary, computedSummary)) issue("runRecord.summary", `does not match validator-computed aggregate ${JSON.stringify(computedSummary)}`);

  return { run, caseResults, computedSummary };
}

async function readContainedJson(root, relativePath, label) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || isAbsolute(relativePath)) throw new Error(`${label} path must be a non-empty path relative to --root`);
  const candidate = resolve(root, relativePath);
  const relativeCandidate = relative(root, candidate);
  if (relativeCandidate.startsWith("..") || isAbsolute(relativeCandidate)) throw new Error(`${label} path escapes --root`);
  const realCandidate = await realpath(candidate);
  const contained = relative(root, realCandidate);
  if (contained.startsWith("..") || isAbsolute(contained)) throw new Error(`${label} real path escapes --root`);
  const info = await stat(realCandidate);
  if (!info.isFile() || info.size > MAX_FILE_BYTES) throw new Error(`${label} must be a regular JSON file no larger than ${MAX_FILE_BYTES} bytes`);
  const text = await readFile(realCandidate, "utf8");
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  return { json, digest: createHash("sha256").update(text).digest("hex"), relativePath };
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--help") return { help: true };
    if (!["--root", "--qualification", "--crosswalk", "--run"].includes(key)) throw new Error(`unknown argument: ${key}`);
    if (values[key]) throw new Error(`duplicate argument: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for ${key}`);
    values[key] = value;
    index += 1;
  }
  for (const key of ["--root", "--qualification", "--crosswalk"]) {
    if (!values[key]) throw new Error(`missing required argument: ${key}`);
  }
  return {
    root: values["--root"],
    qualification: values["--qualification"],
    crosswalk: values["--crosswalk"],
    run: values["--run"],
  };
}

function write(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write("Usage: validate-manual-parity --root <project-root> --qualification <relative-json> --crosswalk <relative-json> [--run <relative-json>]\n");
    return;
  }
  const root = await realpath(resolve(args.root));
  const qualificationFile = await readContainedJson(root, args.qualification, "qualification");
  const crosswalkFile = await readContainedJson(root, args.crosswalk, "crosswalk");
  const qualification = validateQualification(qualificationFile.json);
  const crosswalk = validateCrosswalk(crosswalkFile.json, qualification, qualificationFile.digest);
  let run;
  let runFile;
  if (args.run) {
    runFile = await readContainedJson(root, args.run, "run record");
    run = validateRun(runFile.json, qualification, crosswalk, qualificationFile.digest, crosswalkFile.digest);
  }
  if (errorsTruncated) errors.push({ path: "validator", message: `additional errors were truncated after ${MAX_ERRORS}` });
  const output = {
    schemaVersion: 1,
    ok: errors.length === 0,
    files: {
      qualification: { path: qualificationFile.relativePath, sha256: qualificationFile.digest },
      crosswalk: { path: crosswalkFile.relativePath, sha256: crosswalkFile.digest },
      ...(runFile ? { run: { path: runFile.relativePath, sha256: runFile.digest } } : {}),
    },
    crosswalk: {
      ready: crosswalk.ready,
      baselineApproved: crosswalk.baselineApproved,
      requirementsApproved: crosswalk.requirementsApproved,
      coverageReady: crosswalk.coverageReady,
      manualCases: qualification.manualCases.size,
      requirements: qualification.requirements.size,
    },
    ...(run ? { run: { id: run.run.id, computedSummary: run.computedSummary } } : {}),
    assurance: "structural-only; reviewer identity, artifact authenticity, and product behavior are not attested",
    errors,
  };
  write(output);
  if (!output.ok) process.exitCode = 1;
}

main().catch((error) => {
  write({
    schemaVersion: 1,
    ok: false,
    error: { code: "VALIDATOR_INPUT_ERROR", message: (error instanceof Error ? error.message : String(error)).slice(0, 500) },
  });
  process.exitCode = 2;
});
