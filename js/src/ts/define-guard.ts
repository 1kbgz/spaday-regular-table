// The regular-table engine registers the <regular-table> custom element as an import
// side effect, and other bundles inline their own copy of the engine (notably
// spaday-perspective, whose viewer-datagrid plugin bundles regular-table). Whichever
// bundle loads second would throw NotSupportedError from customElements.define and die
// wholesale. Make define idempotent while our engine import runs so the first
// registration of a tag wins and later duplicates are ignored instead of fatal.
const define = customElements.define.bind(customElements);
const lookup = customElements.get.bind(customElements);
// names this bundle registered itself
const ours = new Set<string>();

customElements.define = (
  name: string,
  ctor: CustomElementConstructor,
  options?: ElementDefinitionOptions,
) => {
  if (lookup(name)) return;
  define(name, ctor, options);
  ours.add(name);
};

/** Put the real `define` back, and warn if another copy had already registered any of `tags`, the
 * elements this bundle serves: the page keeps that copy's, which need not match the version this
 * package serves and its catalog describes. `served` names that version, e.g.
 * "@awesome.me/webawesome 3.12.0". A tag that is registered, but not by this bundle, is another
 * copy's -- whether the library skipped it just now or defines its elements later. */
export function restoreDefine(
  served: string,
  tags: readonly string[] = [],
): void {
  customElements.define = define;
  const taken = tags.filter((tag) => lookup(tag) && !ours.has(tag));
  if (!taken.length) return;
  const shown = taken
    .slice(0, 3)
    .map((tag) => `<${tag}>`)
    .join(", ");
  const more = taken.length > 3 ? ` and ${taken.length - 3} more` : "";
  console.warn(
    `${served}: another copy on the page already registered ${shown}${more}; the page keeps that copy's elements, which may not match this version`,
  );
}
