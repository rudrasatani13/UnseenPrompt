export type PublicWaitlistResult =
  | { readonly kind: "accepted" }
  | { readonly kind: "invalid_email" }
  | { readonly kind: "verification_failed" }
  | { readonly kind: "temporary_failure" };

export type ConfirmationResult = "confirmed" | "already_confirmed" | "expired" | "invalid";
export type RemovalResult = "removed" | "already_removed" | "invalid";

export interface Clock {
  now(): Date;
}

export interface IdempotencyKeyGenerator {
  create(): string;
}

export interface TokenCodec {
  deriveConfirmation(idempotencyKey: string): Promise<string>;
  hashConfirmation(token: string): Promise<string>;
  signManagement(entryId: string, managementVersion: number): Promise<string>;
  verifyManagement(
    token: string,
  ): Promise<{ readonly entryId: string; readonly managementVersion: number } | null>;
}

export interface TurnstileVerifier {
  verify(input: {
    readonly token: string;
    readonly action: "waitlist_request";
    readonly hostname: string;
    readonly idempotencyKey: string;
  }): Promise<"verified" | "rejected" | "unavailable">;
}

export interface ConfirmationMailer {
  send(input: {
    readonly email: string;
    readonly confirmationUrl: string;
    readonly idempotencyKey: string;
  }): Promise<"sent" | "unavailable" | "misconfigured">;
}

export type RequestConfirmationDecision =
  | { readonly kind: "send"; readonly idempotencyKey: string }
  | { readonly kind: "cooldown" }
  | { readonly kind: "confirmed" };

export interface WaitlistRepository {
  requestConfirmation(input: {
    readonly email: string;
    readonly emailNormalized: string;
    readonly consentAt: Date;
    readonly candidateTokenHash: string;
    readonly candidateExpiresAt: Date;
    readonly candidateIdempotencyKey: string;
  }): Promise<RequestConfirmationDecision>;
  markConfirmationSent(input: {
    readonly emailNormalized: string;
    readonly idempotencyKey: string;
    readonly sentAt: Date;
  }): Promise<void>;
  confirm(input: { readonly tokenHash: string; readonly now: Date }): Promise<ConfirmationResult>;
  remove(input: {
    readonly entryId: string;
    readonly managementVersion: number;
    readonly now: Date;
  }): Promise<RemovalResult>;
}

export interface WaitlistRequest {
  readonly email: string;
  readonly turnstileToken: string;
  readonly requestId: string;
}

export interface WaitlistService {
  request(input: WaitlistRequest): Promise<PublicWaitlistResult>;
  confirm(token: string): Promise<ConfirmationResult>;
  remove(token: string): Promise<RemovalResult>;
}
