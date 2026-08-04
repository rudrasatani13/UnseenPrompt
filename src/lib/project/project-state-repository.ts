import "server-only";

import type {
  ProjectCommandEnvelopeV1,
  ProjectCommandV1,
  ProjectCommitResultV1,
  ProjectStateSnapshotV1,
} from "@/domain/project/contracts";

/** The only identity accepted by the proposal-apply boundary is its persisted generation run. */
export interface ApplyValidatedDeltaV1 {
  readonly projectId: string;
  readonly generationRunId: string;
  readonly expectedStateVersion: number;
}

/**
 * Owner-scoped project-state persistence. Implementations derive owner and actor identity from the
 * authenticated client; callers never provide either identity or a privileged actor type.
 */
export interface ProjectStateRepository {
  getSnapshot(projectId: string): Promise<ProjectStateSnapshotV1>;
  execute(command: ProjectCommandEnvelopeV1<ProjectCommandV1>): Promise<ProjectCommitResultV1>;
  applyValidatedDelta(input: ApplyValidatedDeltaV1): Promise<ProjectCommitResultV1>;
}
