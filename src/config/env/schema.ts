import { z } from "zod";

const applicationUrlSchema = z.url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  },
  {
    message: "NEXT_PUBLIC_APP_URL must use HTTP or HTTPS",
  },
);

const environmentSchema = z
  .object({
    APP_ENV: z.enum(["local", "preview", "staging", "production", "test"]),
    NEXT_PUBLIC_APP_URL: applicationUrlSchema,
    RELEASE_SHA: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/, "RELEASE_SHA contains unsupported characters"),
  })
  .superRefine((environment, context) => {
    const requiresHttps = environment.APP_ENV === "staging" || environment.APP_ENV === "production";

    if (requiresHttps && new URL(environment.NEXT_PUBLIC_APP_URL).protocol !== "https:") {
      context.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_APP_URL"],
        message: "HTTPS is required in staging and production",
      });
    }
  })
  .readonly();

export type AppEnvironment = z.infer<typeof environmentSchema>;

export function parseEnvironment(values: Record<string, string | undefined>): AppEnvironment {
  return environmentSchema.parse(values);
}
