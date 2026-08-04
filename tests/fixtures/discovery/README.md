# Discovery fixtures

These inputs are synthetic, deterministic, and contain no provider credentials or customer data.
Every lifecycle mode has at least one representative fixture. The boundary fixture describes how
the test constructs an exact UTF-8 payload instead of checking in a large opaque blob.

Fixture fields:

- `mode`: expected lifecycle mode for intent routing.
- `skillLevel`: beginner, intermediate, or expert context.
- `language`: a stable language label used by multilingual coverage.
- `initialRequestText`: synthetic user input treated as untrusted data.
- `tags`: coverage labels for sparse, long, multilingual, retry, or privacy cases.
