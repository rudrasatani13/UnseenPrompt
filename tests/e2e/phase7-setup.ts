import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  PHASE7_MOCK_DRAFT_ID,
  PHASE7_MOCK_INTENT_RUN_ID,
  PHASE7_MOCK_PROJECT_ID,
  PHASE7_MOCK_QUESTION_ID,
  PHASE7_MOCK_QUESTION_RUN_ID,
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

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Phase 7 E2E setup request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

async function authRequest<T>(path: string, body: unknown, key: string): Promise<T> {
  const response = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return readJson<T>(response);
}

async function restRequest(method: "POST" | "PATCH", path: string, body: unknown): Promise<void> {
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
    throw new Error(`Phase 7 E2E fixture request failed (${response.status})`);
  }
}

async function main(): Promise<void> {
  const suffix = randomUUID();
  const email = `phase7-e2e-${suffix}@users.invalid`;
  const password = `Phase7-${suffix}-Aa1!`;
  const created = await authRequest<AuthUser>(
    "admin/users",
    { email, password, email_confirm: true },
    serviceRoleKey,
  );
  const session = await authRequest<AuthSession>(
    "token?grant_type=password",
    { email, password },
    publishableKey,
  );
  if (created.id !== session.user.id) {
    throw new Error("Phase 7 E2E auth setup returned mismatched users");
  }

  const ownerId = created.id;
  const now = new Date().toISOString();

  await restRequest("POST", "profiles", {
    id: ownerId,
    display_name: "Phase 7 E2E",
    locale: "en",
    time_zone: "UTC",
    onboarding_completed_at: now,
  });
  await restRequest("POST", "composer_drafts", {
    id: PHASE7_MOCK_DRAFT_ID,
    owner_id: ownerId,
    version: 1,
    initial_request_text: "Build a small field notebook for recording observations.",
    status: "routing",
  });
  await restRequest("POST", "generation_runs", {
    id: PHASE7_MOCK_INTENT_RUN_ID,
    project_id: null,
    subject_kind: "composer_draft",
    composer_draft_id: PHASE7_MOCK_DRAFT_ID,
    operation_kind: "intent_detection",
    status: "succeeded",
    project_state_version: 1,
    provider: "anthropic",
    model: "phase7-e2e-fixture",
    input_schema_version: "unseenprompt.model-input.intent_detection.v1",
    output_schema_version: "unseenprompt.model-output.intent_detection.v1",
    latency_ms: 1,
    input_tokens: 1,
    output_tokens: 1,
    validation_result: "passed",
    started_at: now,
    completed_at: now,
  });
  await restRequest("POST", "projects", {
    id: PHASE7_MOCK_PROJECT_ID,
    owner_id: ownerId,
    title: "Field notebook",
    mode: "new_build",
    stage: "discovery",
    state_version: 1,
  });
  await restRequest(`PATCH`, `composer_drafts?id=eq.${PHASE7_MOCK_DRAFT_ID}`, {
    status: "promoted",
    detected_mode: "new_build",
    confidence: 0.9,
    rationale: "The request describes a small new build.",
    detected_language: "en",
    intent_generation_run_id: PHASE7_MOCK_INTENT_RUN_ID,
    confirmed_mode: "new_build",
    confirmed_title: "Field notebook",
    project_id: PHASE7_MOCK_PROJECT_ID,
    promoted_at: now,
  });
  await restRequest("POST", "generation_runs", {
    id: PHASE7_MOCK_QUESTION_RUN_ID,
    project_id: PHASE7_MOCK_PROJECT_ID,
    subject_kind: "project",
    composer_draft_id: null,
    operation_kind: "clarification_question",
    status: "succeeded",
    project_state_version: 1,
    provider: "anthropic",
    model: "phase7-e2e-fixture",
    input_schema_version: "unseenprompt.model-input.clarification_question.v1",
    output_schema_version: "unseenprompt.model-output.clarification_question.v1",
    latency_ms: 1,
    input_tokens: 1,
    output_tokens: 1,
    validation_result: "passed",
    started_at: now,
    completed_at: now,
  });
  await restRequest("POST", "discovery_sessions", {
    id: PHASE7_MOCK_SESSION_ID,
    project_id: PHASE7_MOCK_PROJECT_ID,
    source_draft_id: PHASE7_MOCK_DRAFT_ID,
    status: "abandoned",
    policy_version: 1,
    confirmed_turn_count: 1,
    abandoned_at: now,
  });
  await restRequest("POST", "discovery_questions", {
    id: PHASE7_MOCK_QUESTION_ID,
    project_id: PHASE7_MOCK_PROJECT_ID,
    session_id: PHASE7_MOCK_SESSION_ID,
    generation_run_id: PHASE7_MOCK_QUESTION_RUN_ID,
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
  await restRequest(`PATCH`, `discovery_sessions?id=eq.${PHASE7_MOCK_SESSION_ID}`, {
    active_question_id: PHASE7_MOCK_QUESTION_ID,
  });

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
