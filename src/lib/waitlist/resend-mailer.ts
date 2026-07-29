import type { ConfirmationMailer } from "@/domain/waitlist/contracts";

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 5_000;
const SUBJECT = "Confirm your UnseenPrompt email";

export interface ResendMailerOptions {
  readonly apiKey: string;
  readonly fromEmail: "UnseenPrompt <hello@unseenprompt.com>";
  readonly appOrigin: string;
  readonly fetchImpl?: typeof fetch;
}

function buildBodies(confirmationUrl: string): { html: string; text: string } {
  const text = [
    "You asked to hear when UnseenPrompt is ready to try.",
    "",
    "Confirm my email:",
    confirmationUrl,
    "",
    "This link expires in 24 hours. If you did not ask for this, ignore this email.",
  ].join("\n");

  const html = [
    "<p>You asked to hear when UnseenPrompt is ready to try.</p>",
    `<p><a href="${confirmationUrl}">Confirm my email</a></p>`,
    "<p>This link expires in 24 hours. If you did not ask for this, ignore this email.</p>",
  ].join("");

  return { html, text };
}

function isAllowedConfirmationUrl(url: string, appOrigin: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === appOrigin && parsed.pathname === "/waitlist/confirm";
  } catch {
    return false;
  }
}

export function createResendMailer(options: ResendMailerOptions): ConfirmationMailer {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async send(input) {
      if (!isAllowedConfirmationUrl(input.confirmationUrl, options.appOrigin)) {
        return "misconfigured";
      }

      const { html, text } = buildBodies(input.confirmationUrl);
      const body = JSON.stringify({
        from: options.fromEmail,
        to: [input.email],
        subject: SUBJECT,
        html,
        text,
      });

      let response: Response;
      try {
        response = await fetchImpl(RESEND_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": input.idempotencyKey,
          },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        return "unavailable";
      }

      if (response.status === 409 || (response.status >= 200 && response.status < 300)) {
        return "sent";
      }

      if (response.status === 429 || response.status >= 500) {
        return "unavailable";
      }

      return "misconfigured";
    },
  };
}
