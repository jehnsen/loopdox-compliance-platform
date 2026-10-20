import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

/** Shared chrome: colours, selection, tooltips, completion list and the find panel. */
export const baseTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--surface)', color: 'var(--fg)', height: '100%' },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': { padding: '20px 0 32px', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 28px' },
  '.cm-gutters': { display: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--accent-soft) !important',
  },
  '.cm-searchMatch': {
    backgroundColor: 'color-mix(in srgb, var(--warn) 22%, transparent)',
    borderRadius: '2px',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in srgb, var(--warn) 45%, transparent)',
  },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)' },
  '.cm-tooltip': {
    backgroundColor: 'var(--surface)',
    color: 'var(--fg)',
    border: '1px solid var(--line)',
    borderRadius: '8px',
    boxShadow: 'var(--shadow-pop)',
    overflow: 'hidden',
  },
  // Beats CodeMirror's own monospace rule for the list, which uses the same selector.
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    fontFamily: 'var(--font-sans) !important',
    fontSize: '14px',
    maxHeight: '18rem',
    minWidth: '15rem',
    padding: '4px',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    padding: '6px 10px',
    lineHeight: '20px',
    borderRadius: '6px',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent-soft)',
    color: 'var(--fg)',
  },
  '.cm-completionLabel': { fontWeight: '500' },
  '.cm-completionDetail': { color: 'var(--muted)', fontStyle: 'normal', marginLeft: '10px' },
  '.cm-completionMatchedText': { textDecoration: 'none', color: 'var(--accent)' },
  '.cm-placeholder': { color: 'var(--muted)' },
  // Find & replace sits under the app bar and the editor toolbar while scrolling.
  '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--fg)', zIndex: '15' },
  '.cm-panels-top': {
    top: 'var(--md-sticky-top, 0px) !important',
    borderBottom: '1px solid var(--line)',
  },
  '.cm-panel.cm-search': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    fontFamily: 'var(--font-sans)',
    fontSize: '13px',
  },
  '.cm-panel.cm-search br': { flexBasis: '100%', height: '0' },
  '.cm-panel.cm-search label': { display: 'inline-flex', alignItems: 'center', gap: '4px' },
  '.cm-textfield': {
    height: '28px',
    padding: '0 8px',
    border: '1px solid var(--line-strong)',
    borderRadius: '6px',
    backgroundColor: 'var(--surface)',
    color: 'var(--fg)',
    fontSize: '13px',
  },
  '.cm-button': {
    height: '28px',
    padding: '0 10px',
    border: '1px solid var(--line)',
    borderRadius: '6px',
    backgroundImage: 'none',
    backgroundColor: 'var(--surface)',
    color: 'var(--fg)',
    fontSize: '13px',
  },
  '.cm-button:hover': { backgroundColor: 'var(--surface-2)' },
  '.cm-panel.cm-search [name=close]': {
    position: 'static',
    marginLeft: 'auto',
    fontSize: '18px',
    color: 'var(--muted)',
  },
})

// ---------------------------------------------------------------------------
// Source view: monospace, Markdown syntax visible and muted
// ---------------------------------------------------------------------------

const sourceTheme = EditorView.theme({
  '.cm-scroller': { fontFamily: 'var(--font-mono)', fontSize: '14px', lineHeight: '1.65' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--surface-2) 50%, transparent)' },
})

const sourceHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: '600', fontSize: '1.15em' },
  { tag: tags.heading2, fontWeight: '600', fontSize: '1.1em' },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontWeight: '600' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--accent)' },
  { tag: tags.quote, color: 'var(--muted)' },
  { tag: tags.monospace, color: 'var(--ok)' },
  // Markup characters (#, *, -, >, list markers) are muted; content stays full contrast.
  { tag: [tags.processingInstruction, tags.contentSeparator], color: 'var(--muted)' },
])

export const sourcePresentation: Extension = [sourceTheme, syntaxHighlighting(sourceHighlight)]

// ---------------------------------------------------------------------------
// Live preview: reads like the published page
// ---------------------------------------------------------------------------

const liveTheme = EditorView.theme({
  '.cm-scroller': { fontFamily: 'var(--font-sans)', fontSize: '15px', lineHeight: '1.7' },
  '.cm-content': { maxWidth: 'calc(72ch + 56px)' },
  '.cm-lp-h1, .cm-lp-h2, .cm-lp-h3, .cm-lp-h4, .cm-lp-h5, .cm-lp-h6': {
    fontWeight: '600',
    lineHeight: '1.35',
    letterSpacing: '-0.01em',
  },
  '.cm-lp-h1': { fontSize: '24px', paddingTop: '18px', paddingBottom: '4px' },
  '.cm-lp-h2': { fontSize: '20px', paddingTop: '16px', paddingBottom: '2px' },
  '.cm-lp-h3': { fontSize: '17px', paddingTop: '10px' },
  '.cm-lp-h4, .cm-lp-h5, .cm-lp-h6': { fontSize: '15px', paddingTop: '6px' },
  '.cm-lp-code': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.875em',
    backgroundColor: 'var(--surface-2)',
    borderRadius: '4px',
    padding: '0.1em 0.3em',
  },
  '.cm-lp-link, .cm-lp-wiki': {
    color: 'var(--accent)',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
    textDecorationThickness: '1px',
  },
  '.cm-lp-wiki': { fontWeight: '500', textDecorationStyle: 'dotted' },
  '.cm-lp-bullet': {
    display: 'inline-block',
    width: '1.1em',
    color: 'var(--muted)',
    fontWeight: '700',
  },
  '.cm-lp-number': { color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' },
  '.cm-lp-task': {
    width: '15px',
    height: '15px',
    margin: '0 8px 0 0',
    verticalAlign: '-2px',
    accentColor: 'var(--accent)',
    cursor: 'pointer',
  },
  '.cm-lp-done': { color: 'var(--muted)', textDecoration: 'line-through' },
  '.cm-line.cm-lp-quote': {
    color: 'var(--muted)',
    marginLeft: '28px',
    paddingLeft: '14px',
    borderLeft: '3px solid var(--line-strong)',
  },
  '.cm-lp-rule': {
    display: 'inline-block',
    width: '100%',
    height: '1px',
    verticalAlign: 'middle',
    backgroundColor: 'var(--line-strong)',
  },
  '.cm-lp-codeblock': {
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    lineHeight: '1.6',
    backgroundColor: 'var(--surface-2)',
  },
  '.cm-lp-table': { fontFamily: 'var(--font-mono)', fontSize: '13px' },
  '.cm-lp-image': { display: 'inline-block', maxWidth: '100%', margin: '6px 0' },
  '.cm-lp-image img': {
    display: 'block',
    maxWidth: '100%',
    maxHeight: '420px',
    borderRadius: '8px',
    border: '1px solid var(--line)',
  },
  '.cm-lp-image-missing': { color: 'var(--bad)', fontSize: '13px' },
  '.cm-lp-uploading': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '2px 10px',
    borderRadius: '999px',
    backgroundColor: 'var(--accent-soft)',
    color: 'var(--accent)',
    fontSize: '13px',
  },
})

const liveHighlight = HighlightStyle.define([
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.url, color: 'var(--muted)' },
  // On the line being edited, Markdown symbols show muted so the text still reads first.
  {
    tag: [tags.processingInstruction, tags.contentSeparator, tags.separator, tags.meta],
    color: 'var(--muted)',
  },
])

export const livePresentation: Extension = [liveTheme, syntaxHighlighting(liveHighlight)]
