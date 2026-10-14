import { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize'

/**
 * Strict sanitize schema: GitHub's defaults (no raw HTML, no scripts, no event
 * handlers, safe URL protocols), plus the classes our wiki links use.
 */
export const markdownSchema: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), ['className', 'wikilink'], 'title'],
    span: [...(defaultSchema.attributes?.span ?? []), ['className', 'wikilink-broken'], 'title'],
  },
  tagNames: [...(defaultSchema.tagNames ?? []), 'span'],
}
