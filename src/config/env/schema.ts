import { z } from "zod";

const environmentSchema = z
  .object({
    APP_ENV: z.enum(["local", "preview", "staging", "production", "test"]),
    NEXT_PUBLIC_APP_URL: z.url(),
  })
  .readonly();

export type AppEnvironment = z.infer<typeof environmentSchema>;

export function parseEnvironment(values: Record<string, string | undefined>): AppEnvironment {
  return environmentSchema.parse(values);
}
