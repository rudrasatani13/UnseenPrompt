import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  PHASE7_MOCK_DRAFT_ID,
  PHASE7_MOCK_PROJECT_ID,
  PHASE7_MOCK_QUESTION_ID,
  PHASE7_MOCK_SESSION_ID,
} from "./phase7-fixtures";

function requiredEnvironmentValue(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Phase 7 E2E setup requires ${name}`);
  return value;
}

const supabaseUrl = requiredEnvironmentValue(
  "SUPABASE_AUTH_TEST_URL",
  process.env.SUPABASE_AUTH_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
);
const publishableKey = requiredEnvironmentValue(
  "SUPABASE_AUTH_TEST_PUBLISHABLE_KEY",
  process.env.SUPABASE_AUTH_TEST_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
const serviceRoleKey = requiredEnvironmentValue(
  "SUPABASE_AUTH_TEST_SERVICE_ROLE_KEY",
  process.env.SUPABASE_AUTH_TEST_SERVICE_ROLE_KEY,
);
const storageStatePath = resolve(
  process.env.E2E_PHASE7_STORAGE_STATE ?? "/tmp/unseenprompt-phase7-auth-state.json",
);

interface AuthUser {
  readonly id: string;
}

interface AuthSession {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_in: number;
  readonly expires_at?: number;
  readonly token_type: string;
  readonly user: AuthUser;
}

interface GenerationRunReceipt {
  readonly run_id: string;
}

function safeResponseDetail(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null) return "";
    const record = parsed as Record<string, unknown>;
    const nested = record.error;
    const nestedRecord =
      typeof nested === "object" && nested !== null ? (nested as Record<string, unknown>) : null;
    const detail = [
      record.code,
      record.message,
      record.details,
      nestedRecord?.code,
      nestedRecord?.message,
    ].find((value) => typeof value === "string" && value.trim().length > 0);
    if (typeof detail !== "string") return "";
    return detail
      .replace(/Bearer\s+\S+/giu, "Bearer [redacted]")
      .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9._-]+\b/gu, "[redacted]")
      .slice(0, 240);
  } catch {
    return "";
  }
}

async function failResponse(response: Response, operation: string): Promise<never> {
  const detail = safeResponseDetail(await response.text());
  throw new Error(
    `${operation} failed (${response.status})${detail.length === 0 ? "" : `: ${detail}`}`,
  );
}

async function readJson<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok) {
    return failResponse(response, operation);
  }
  const body = await response.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`${operation} returned invalid JSON`);
  }
}

async function authRequest<T>(
  operation: string,
  path: string,
  body: unknown,
  key: string,
): Promise<T> {
  const response = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return readJson<T>(response, operation);
}

async function restRequest(
  operation: string,
  method: "POST" | "PATCH",
  path: string,
  body: unknown,
): Promise<void> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-profile": "public",
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    await failResponse(response, operation);
  }
}

async function rpcRequest<T>(operation: string, functionName: string, body: unknown): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return readJson<T>(response, operation);
}

function requestFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function firstRunId(value: GenerationRunReceipt[] | GenerationRunReceipt): string {
  const row = Array.isArray(value) ? value[0] : value;
  if (row === undefined || typeof row.run_id !== "string" || row.run_id.length === 0) {
    throw new Error("Phase 7 E2E generation claim returned no run");
  }
  return row.run_id;
}

async function claimGenerationRun(input: {
  readonly ownerId: string;
  readonly subjectKind: "project" | "composer_draft";
  readonly subjectId: string;
  readonly subjectVersion: number;
  readonly operationKind: "intent_detection" | "clarification_question";
}): Promise<string> {
  const idempotencyKey = `phase7-e2e-${input.operationKind}-${randomUUID()}`;
  return firstRunId(
    await rpcRequest<GenerationRunReceipt[] | GenerationRunReceipt>(
      `claim ${input.operationKind} generation run`,
      "claim_generation_run_v3_server",
      {
        p_owner_id: input.ownerId,
        p_subject_kind: input.subjectKind,
        p_subject_id: input.subjectId,
        p_subject_state_version: input.subjectVersion,
        p_idempotency_key: idempotencyKey,
        p_request_fingerprint: requestFingerprint({ ...input, idempotencyKey }),
        p_operation_kind: input.operationKind,
        p_input_schema_version: "unseenprompt.model-gateway-request.v3",
        p_output_schema_version: `unseenprompt.model-output.${input.operationKind}.v1`,
      },
    ),
  );
}

async function completeGenerationRun(
  ownerId: string,
  runId: string,
  outputText: string,
): Promise<void> {
  await rpcRequest<GenerationRunReceipt[] | GenerationRunReceipt>(
    "complete Phase 7 fixture generation run",
    "complete_generation_run_v3_server",
    {
      p_owner_id: ownerId,
      p_run_id: runId,
      p_status: "succeeded",
      p_provider: "anthropic",
      p_model: "phase7-e2e-fixture",
      p_latency_ms: 1,
      p_input_tokens: 1,
      p_output_tokens: 1,
      p_retry_count: 0,
      p_estimated_cost_micros: 0,
      p_validation_result: "passed",
      p_error_code: null,
      p_validated_output_text: outputText,
    },
  );
}

async function main(): Promise<void> {
  const suffix = randomUUID();
  const email = `phase7-e2e-${suffix}@users.invalid`;
  const password = `Phase7-${suffix}-Aa1!`;
  const created = await authRequest<AuthUser>(
    "create ephemeral E2E user",
    "admin/users",
    { email, password, email_confirm: true },
    serviceRoleKey,
  );
  const session = await authRequest<AuthSession>(
    "sign in ephemeral E2E user",
    "token?grant_type=password",
    { email, password },
    publishableKey,
  );
  if (created.id !== session.user.id) {
    throw new Error("Phase 7 E2E auth setup returned mismatched users");
  }

  const ownerId = created.id;
  const now = new Date().toISOString();

  await restRequest("seed profile", "POST", "profiles", {
    id: ownerId,
    display_name: "Phase 7 E2E",
    locale: "en",
    time_zone: "UTC",
    onboarding_completed_at: now,
  });
  await restRequest("seed composer draft", "POST", "composer_drafts", {
    id: PHASE7_MOCK_DRAFT_ID,
    owner_id: ownerId,
    version: 1,
    initial_request_text: "Build a small field notebook for recording observations.",
    status: "routing",
  });
  await restRequest("seed project", "POST", "projects", {
    id: PHASE7_MOCK_PROJECT_ID,
    owner_id: ownerId,
    title: "Field notebook",
    mode: "new_build",
    stage: "discovery",
    state_version: 1,
  });

  const intentRunId = await claimGenerationRun({
    ownerId,
    subjectKind: "composer_draft",
    subjectId: PHASE7_MOCK_DRAFT_ID,
    subjectVersion: 1,
    operationKind: "intent_detection",
  });
  await completeGenerationRun(
    ownerId,
    intentRunId,
    JSON.stringify({
      mode: "new_build",
      confidence: 0.9,
      rationale: "The request describes a small new build.",
      detectedLanguage: "en",
    }),
  );
  await restRequest(
    "promote composer draft fixture",
    "PATCH",
    `composer_drafts?id=eq.${PHASE7_MOCK_DRAFT_ID}`,
    {
      status: "promoted",
      detected_mode: "new_build",
      confidence: 0.9,
      rationale: "The request describes a small new build.",
      detected_language: "en",
      intent_generation_run_id: intentRunId,
      confirmed_mode: "new_build",
      confirmed_title: "Field notebook",
      project_id: PHASE7_MOCK_PROJECT_ID,
      promoted_at: now,
    },
  );

  const questionRunId = await claimGenerationRun({
    ownerId,
    subjectKind: "project",
    subjectId: PHASE7_MOCK_PROJECT_ID,
    subjectVersion: 1,
    operationKind: "clarification_question",
  });
  await completeGenerationRun(
    ownerId,
    questionRunId,
    JSON.stringify({
      question: "What should the first useful version help someone accomplish?",
      rationale: "A concrete first outcome keeps the initial build focused.",
      suggestedAnswers: [
        { label: "Capture observations", value: "Capture observations" },
        { label: "Share a short report", value: "Share a short report" },
      ],
      allowsFreeText: true,
    }),
  );
  await restRequest("seed abandoned discovery session", "POST", "discovery_sessions", {
    id: PHASE7_MOCK_SESSION_ID,
    project_id: PHASE7_MOCK_PROJECT_ID,
    source_draft_id: PHASE7_MOCK_DRAFT_ID,
    status: "abandoned",
    policy_version: 1,
    confirmed_turn_count: 1,
    abandoned_at: now,
  });
  await restRequest("seed active discovery question", "POST", "discovery_questions", {
    id: PHASE7_MOCK_QUESTION_ID,
    project_id: PHASE7_MOCK_PROJECT_ID,
    session_id: PHASE7_MOCK_SESSION_ID,
    generation_run_id: questionRunId,
    position: 1,
    target_fact_key: "clarify_scope",
    basis_state_version: 1,
    question_text: "What should the first useful version help someone accomplish?",
    rationale: "A concrete first outcome keeps the initial build focused.",
    suggested_answers: [
      { label: "Capture observations", value: "Capture observations" },
      { label: "Share a short report", value: "Share a short report" },
    ],
    allows_free_text: true,
    question_fingerprint: "957a2812e3f342098a2db3331575de6aabcb00bfc7a6963d5ebf5717815124b0",
    status: "active",
  });
  await restRequest(
    "attach active discovery question",
    "PATCH",
    `discovery_sessions?id=eq.${PHASE7_MOCK_SESSION_ID}`,
    {
      active_question_id: PHASE7_MOCK_QUESTION_ID,
    },
  );

  const encoded = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
  await mkdir(dirname(storageStatePath), { recursive: true });
  await writeFile(
    storageStatePath,
    JSON.stringify(
      {
        cookies: [
          {
            name: `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`,
            value: encoded,
            url: "http://127.0.0.1",
            path: "/",
            httpOnly: false,
            secure: false,
            sameSite: "Lax",
            expires: Math.floor(Date.now() / 1000) + session.expires_in,
          },
        ],
        origins: [],
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`Phase 7 E2E fixture ready: ${storageStatePath}`);
}

void main();
