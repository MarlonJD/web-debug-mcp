import { createHash, randomUUID } from "node:crypto";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import type { EvidenceBundle } from "../domain/types.js";
import { cloneJson } from "./private-values.js";
import { WebDebugError } from "./errors.js";

const MAX_ENTRIES = 64;
const MAX_ENTRIES_PER_SESSION = 8;
const MAX_BYTES_PER_ENTRY = 98_304;
const TTL_MS = 60 * 60 * 1_000;

export interface EvidenceReference {
  uri: string;
  mimeType: "application/json";
  bytes: number;
  sha256: string;
  capturedAt: string;
  attemptId: string | null;
}

export interface RecordedEvidence {
  schemaVersion: 1;
  profile: "recorded";
  sessionId: string;
  reference: EvidenceReference;
  evidence: EvidenceBundle;
}

interface Entry {
  sessionId: string;
  expiresAt: number;
  reference: EvidenceReference;
  serialized: string;
}

/** Immutable, already-redacted observations, never a live-state cache or a scenario store. */
export class RetainedEvidenceStore {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly active: (sessionId: string) => boolean, private readonly now = Date.now) {}

  retain(sessionId: string, evidence: EvidenceBundle | null): EvidenceReference | null {
    this.prune();
    if (!evidence || !this.active(sessionId)) return null;
    if (evidence.session.id !== sessionId) throw new WebDebugError("EVIDENCE_OWNER_MISMATCH", "Evidence belongs to a different session.");
    const safe = cloneJson(evidence);
    // Screenshots have a separate opaque resource contract. Never retain local filesystem handles here.
    safe.browser.screenshotPath = null;
    safe.session.artifactDir = "[SESSION_ARTIFACTS]";
    const serialized = JSON.stringify(safe);
    const bytes = Buffer.byteLength(serialized);
    if (bytes > MAX_BYTES_PER_ENTRY) throw new WebDebugError("EVIDENCE_LIMIT_EXCEEDED", "Recorded evidence exceeded the 96 KiB limit.");
    const sha256 = createHash("sha256").update(serialized).digest("hex");
    for (const entry of this.entries.values()) {
      if (entry.sessionId === sessionId && entry.reference.sha256 === sha256) return { ...entry.reference };
    }
    const owned = [...this.entries].filter(([, entry]) => entry.sessionId === sessionId);
    if (owned.length >= MAX_ENTRIES_PER_SESSION) this.entries.delete(owned[0]![0]);
    if (this.entries.size >= MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value!);
    const id = randomUUID();
    const reference: EvidenceReference = {
      uri: `web-debug://evidence/${id}`, mimeType: "application/json", bytes, sha256,
      capturedAt: safe.capturedAt, attemptId: safe.attemptId ?? null,
    };
    this.entries.set(id, { sessionId, expiresAt: this.now() + TTL_MS, reference, serialized });
    return { ...reference };
  }

  get(uri: string, sessionId?: string): RecordedEvidence {
    this.prune();
    const match = /^web-debug:\/\/evidence\/([a-f0-9-]{36})$/.exec(uri);
    const entry = match ? this.entries.get(match[1]!) : undefined;
    if (!entry || sessionId !== undefined && entry.sessionId !== sessionId || !this.active(entry.sessionId)) {
      throw new WebDebugError("EVIDENCE_NOT_FOUND", "Recorded evidence is unavailable, expired, or belongs to another session. Capture the required observations again.");
    }
    return { schemaVersion: 1, profile: "recorded", sessionId: entry.sessionId, reference: { ...entry.reference }, evidence: JSON.parse(entry.serialized) as EvidenceBundle };
  }

  read(uri: URL): ReadResourceResult {
    const recorded = this.get(uri.href);
    return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(recorded) }] };
  }

  invalidate(sessionId: string): void {
    for (const [id, entry] of this.entries) if (entry.sessionId === sessionId) this.entries.delete(id);
  }

  private prune(): void {
    for (const [id, entry] of this.entries) if (entry.expiresAt <= this.now() || !this.active(entry.sessionId)) this.entries.delete(id);
  }
}
