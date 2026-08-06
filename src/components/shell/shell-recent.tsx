/**
 * Structural RECENT section for the product sidebar.
 *
 * The reference layout lists recent prompts here. No project listing exists on
 * the product surface yet, so the section renders its header and a muted empty
 * state instead of fake entries.
 */
export function ShellRecent() {
  return (
    <section data-slot="shell-recent" aria-label="Recent prompts" className="mt-6">
      <p className="px-3 pb-2 text-xs font-semibold tracking-wider text-ink-muted uppercase">
        Recent
      </p>
      <p className="px-3 text-xs leading-5 text-ink-muted">Prompts you start will appear here.</p>
    </section>
  );
}
