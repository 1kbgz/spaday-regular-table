// The regular-table engine registers the <regular-table> custom element as an import
// side effect, and other bundles inline their own copy of the engine (notably
// spaday-perspective, whose viewer-datagrid plugin bundles regular-table). Whichever
// bundle loads second would throw NotSupportedError from customElements.define and die
// wholesale. Make define idempotent while our engine import runs so the first
// registration of a tag wins and later duplicates are ignored instead of fatal.
const original = customElements.define.bind(customElements);

customElements.define = (
  name: string,
  ctor: CustomElementConstructor,
  options?: ElementDefinitionOptions,
) => {
  if (!customElements.get(name)) original(name, ctor, options);
};

export function restoreDefine(): void {
  customElements.define = original;
}
