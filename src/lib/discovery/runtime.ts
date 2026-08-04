import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerModelEnvironment } from "@/config/model/server";
import type { Database } from "@/lib/supabase/database.types";
import { createAnthropicAdapter } from "@/lib/model/providers/anthropic";
import { createGeminiAdapter } from "@/lib/model/providers/gemini";
import { createOpenAIAdapter } from "@/lib/model/providers/openai";
import { createOpenCodeAdapter } from "@/lib/model/providers/opencode";
import { createModelGateway } from "@/lib/model/gateway";
import {
  createSupabaseGenerationRunStore,
  createSupabaseServerGenerationRunRpcClient,
} from "@/lib/model/supabase-generation-run-store";
import { createSupabaseProjectStateRepository } from "@/lib/project/supabase-project-state-repository";

import { createDiscoveryService, type DiscoveryService } from "./discovery-service";
import { createSupabaseDiscoveryRepository } from "./supabase-discovery-repository";

/** Compose all owner-scoped Phase 7 adapters behind the server-only service boundary. */
export function createDiscoveryRuntime(
  authenticatedSupabaseClient: SupabaseClient<Database>,
): DiscoveryService {
  const environment = getServerModelEnvironment();
  const adapters = {
    anthropic: createAnthropicAdapter({ apiKey: environment.apiKeys.anthropic ?? "" }),
    openai: createOpenAIAdapter({ apiKey: environment.apiKeys.openai ?? "" }),
    gemini: createGeminiAdapter({ apiKey: environment.apiKeys.gemini ?? "" }),
    opencode: createOpenCodeAdapter({ apiKey: environment.apiKeys.opencode ?? "" }),
  } as const;
  let ownerIdPromise: Promise<string> | undefined;
  const gateway = createModelGateway({
    environment,
    adapters,
    store: createSupabaseGenerationRunStore(authenticatedSupabaseClient, {
      serverClientFactory: createSupabaseServerGenerationRunRpcClient,
      ownerIdProvider: async () => {
        ownerIdPromise ??= authenticatedSupabaseClient.auth.getUser().then(({ data, error }) => {
          if (error || data.user === null) throw new Error("authenticated owner unavailable");
          return data.user.id;
        });
        return ownerIdPromise;
      },
    }),
  });

  return createDiscoveryService({
    repository: createSupabaseDiscoveryRepository(authenticatedSupabaseClient),
    gateway,
    projectStateRepository: createSupabaseProjectStateRepository(authenticatedSupabaseClient),
  });
}
