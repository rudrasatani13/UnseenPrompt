import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { WaitlistEnvironment } from "@/config/waitlist/schema";
import type {
  ConfirmationResult,
  RemovalResult,
  RequestConfirmationDecision,
  WaitlistRepository,
} from "@/domain/waitlist/contracts";

export class WaitlistProviderError extends Error {
  readonly provider: string;
  readonly category: string;

  constructor(provider: string, category: string) {
    super(`${provider}:${category}`);
    this.name = "WaitlistProviderError";
    this.provider = provider;
    this.category = category;
  }
}

const requestDecisionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("send"),
    idempotency_key: z.string().uuid(),
  }),
  z.object({ kind: z.literal("cooldown") }),
  z.object({ kind: z.literal("confirmed") }),
]);

const confirmationResultSchema = z.enum([
  "confirmed",
  "already_confirmed",
  "expired",
  "invalid",
]);
const removalResultSchema = z.enum(["removed", "already_removed", "invalid"]);

function toIso(date: Date): string {
  return date.toISOString();
}

export function createSupabaseWaitlistRepository(
  environment: Pick<WaitlistEnvironment, "supabaseUrl" | "supabaseSecretKey">,
  client: SupabaseClient = createClient(environment.supabaseUrl, environment.supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }),
): WaitlistRepository {
  return {
    async requestConfirmation(input): Promise<RequestConfirmationDecision> {
      const { data, error } = await client.rpc("request_waitlist_confirmation", {
        p_email: input.email,
        p_email_normalized: input.emailNormalized,
        p_consent_at: toIso(input.consentAt),
        p_candidate_token_hash: input.candidateTokenHash,
        p_candidate_expires_at: toIso(input.candidateExpiresAt),
        p_candidate_idempotency_key: input.candidateIdempotencyKey,
      });

      if (error) {
        throw new WaitlistProviderError("supabase", "rpc_error");
      }

      const parsed = requestDecisionSchema.safeParse(data);
      if (!parsed.success) {
        throw new WaitlistProviderError("supabase", "unexpected_payload");
      }

      if (parsed.data.kind === "send") {
        return { kind: "send", idempotencyKey: parsed.data.idempotency_key };
      }

      return { kind: parsed.data.kind };
    },

    async markConfirmationSent(input): Promise<void> {
      const { error } = await client.rpc("mark_waitlist_confirmation_sent", {
        p_email_normalized: input.emailNormalized,
        p_idempotency_key: input.idempotencyKey,
        p_sent_at: toIso(input.sentAt),
      });

      if (error) {
        throw new WaitlistProviderError("supabase", "rpc_error");
      }
    },

    async confirm(input): Promise<ConfirmationResult> {
      const { data, error } = await client.rpc("confirm_waitlist_entry", {
        p_token_hash: input.tokenHash,
        p_now: toIso(input.now),
      });

      if (error) {
        throw new WaitlistProviderError("supabase", "rpc_error");
      }

      const parsed = confirmationResultSchema.safeParse(data);
      if (!parsed.success) {
        throw new WaitlistProviderError("supabase", "unexpected_payload");
      }

      return parsed.data;
    },

    async remove(input): Promise<RemovalResult> {
      const { data, error } = await client.rpc("remove_waitlist_entry", {
        p_entry_id: input.entryId,
        p_management_version: input.managementVersion,
        p_now: toIso(input.now),
      });

      if (error) {
        throw new WaitlistProviderError("supabase", "rpc_error");
      }

      const parsed = removalResultSchema.safeParse(data);
      if (!parsed.success) {
        throw new WaitlistProviderError("supabase", "unexpected_payload");
      }

      return parsed.data;
    },
  };
}
