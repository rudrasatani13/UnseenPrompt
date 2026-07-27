# Naming conventions

| Item | Convention | Example |
|---|---|---|
| Domain types | PascalCase, singular | `ProjectDecision` |
| Functions/variables | camelCase, verb-led functions | `confirmDecision` |
| React components | PascalCase file and export | `ProjectComposer.tsx` |
| Route segments | lowercase kebab-case | `project-history` |
| Feature folders | lowercase kebab-case | `prompt-generation` |
| Unit/component tests | adjacent `*.test.ts(x)` | `schema.test.ts` |
| Database tests | five-digit order + snake_case | `00010_projects_rls.test.sql` |
| Migrations | Supabase UTC timestamp + snake_case | `20260727120000_create_projects.sql` |
| SQL identifiers | snake_case, plural tables | `prompt_versions` |
| Environment variables | SCREAMING_SNAKE_CASE; public values start `NEXT_PUBLIC_` | `APP_ENV` |
| Workflow classes | PascalCase ending `Workflow` | `ArtifactExtractionWorkflow` |
| Fixtures | lowercase kebab-case plus intent | `new-build-beginner.json` |
| Correlation IDs | opaque UUID; never encode user data | `correlationId` |

## Prohibitions

- Ambiguous abbreviations in public APIs
- Provider names inside canonical domain types (prefer neutral terms)
- Secrets in filenames, fixtures, snapshots, logs, or error messages
