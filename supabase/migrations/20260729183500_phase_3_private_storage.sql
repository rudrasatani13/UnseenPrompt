-- Phase 3 private artifact Storage. Direct client mutations deferred to Phase 10.

-- Private artifact bucket. Do not comment on storage.buckets (not owned by migrator).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-artifacts',
  'project-artifacts',
  false,
  52428800,
  null
);

-- Canonical object key: <owner_uuid>/<project_uuid>/<artifact_uuid>/<sanitized_filename>
-- Compare against owner_id (text). storage.objects.owner is deprecated.

create policy project_artifacts_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'project-artifacts'
    and auth.uid() is not null
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Explicitly no insert/update/delete policies for authenticated on project-artifacts.
-- service_role bypasses RLS for trusted server jobs.
