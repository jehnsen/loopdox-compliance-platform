import { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize'

type AttributeRule = NonNullable<NonNullable<SanitizeSchema['attributes']>[string]>[number]

/** Adds allowed class names to an element, merged into any existing className rule. */
function withClasses(
  rules: readonly AttributeRule[] | undefined,
  classes: string[],
): AttributeRule[] {
  const list = [...(rules ?? [])]
  const i = list.findIndex((r) => Array.isArray(r) && r[0] === 'className')
  const existing = i >= 0 ? (list[i] as unknown[]).slice(1) : []
  const merged = ['className', ...existing, ...classes] as AttributeRule
  if (i >= 0) list[i] = merged
  else list.push(merged)
  return list
}

/**
 * Strict sanitize schema: GitHub's defaults (no raw HTML, no scripts, no event
 * handlers, safe URL protocols), plus the classes our wiki links and Ask citations use.
 */
export const markdownSchema: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [
      ...withClasses(defaultSchema.attributes?.a, ['wikilink', 'citation-link']),
      'title',
      'ariaLabel',
    ],
    sup: [...withClasses(defaultSchema.attributes?.sup, ['citation-ref', 'citation-pending'])],
    span: [...withClasses(defaultSchema.attributes?.span, ['wikilink-broken']), 'title'],
  },
  tagNames: [...(defaultSchema.tagNames ?? []), 'span'],
}
