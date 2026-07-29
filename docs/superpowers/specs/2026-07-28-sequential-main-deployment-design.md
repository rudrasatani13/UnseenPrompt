# Sequential Main Deployment Design

## Goal

Every commit that reaches `main`, whether by pull-request merge or direct push, automatically deploys
to staging. Production promotion remains paused unless the repository variable
`PRODUCTION_DEPLOY_ENABLED` is exactly `true`. When enabled, production must receive exactly the
commit that passed the staging deployment and smoke test.

## Deployment Flow

1. A push to `main` starts `Deploy Release`.
2. The staging job checks out `github.sha`, validates and builds it, deploys
   `unseenprompt-staging`, and runs the release-identity and authenticated Workflow smoke tests.
3. The production job depends on the successful staging job and is gated by
   `PRODUCTION_DEPLOY_ENABLED == 'true'`.
4. Production checks out the same `github.sha`, validates and builds it, deploys
   `unseenprompt-production`, and runs the same smoke tests against `https://unseenprompt.com`.
5. Any staging failure prevents the production job from starting. Any production failure leaves the
   workflow red and requires diagnosis; Cloudflare version history remains available for an explicit
   rollback if promotion completed before the failure.

## Trigger and Ordering

- Automatic staging deployments trigger only on `push` to `main`.
- Production promotion is skipped while `PRODUCTION_DEPLOY_ENABLED` is not exactly `true`.
- The release workflow concurrency group is global and does not cancel in-progress releases. This
  prevents a later merge from overtaking an earlier staging-to-production sequence.
- Pull-request events never receive staging or production deployment credentials.

## Preview Removal

Remote Cloudflare PR previews are removed:

- Delete the credential-free preview artifact workflow and trusted preview deploy workflow.
- Remove the preview-specific credential, trust-policy, packaging, and extraction checks that no
  longer have a caller.
- Remove documentation that promises a remote preview URL or requires preview Cloudflare
  credentials.

The existing `cloudflare-preview` CI job remains. It builds and smoke-tests the Worker locally without
Cloudflare deployment credentials, preserving runtime-compatibility validation on pull requests.

## Environment and Security Boundaries

- Staging continues to use only the `staging` GitHub Environment secrets.
- Production continues to use only the `production` GitHub Environment secrets.
- Production uses the exact release SHA selected by the workflow; it cannot deploy arbitrary PR
  heads.
- The production custom domains remain `unseenprompt.com` and `www.unseenprompt.com`.
- Release identity and the authenticated Cloudflare Workflow probe remain mandatory after each
  deployment.
- No production secret is introduced into pull-request workflows or client bundles.

## Validation

Automated policy tests will assert:

- The production job depends on staging.
- The production job is gated by `PRODUCTION_DEPLOY_ENABLED == 'true'`.
- Automatic production resolves its release SHA from `github.sha`.
- Only `push` to `main` can start the automatic release path.
- The removed remote-preview workflows and credential references do not return.
- CI retains the local Cloudflare Worker build and preview smoke test.

Repository validation will include formatting, linting, type checking, unit tests, workflow-policy
tests, the Next.js build, the OpenNext Worker build, and existing dependency checks.

## Operational Result

The normal release path becomes:

```text
merge or push to main
  -> staging deploy
  -> staging release/workflow smoke
  -> if PRODUCTION_DEPLOY_ENABLED=true:
       production deploy of the same main SHA
       -> production release/workflow smoke
```

No preview Cloudflare account ID or preview API token is required.
