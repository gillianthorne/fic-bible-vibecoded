import { EditorSelection, EditorState, RangeSet, StateField } from '@codemirror/state'
import { EditorView, GutterMarker, gutter, keymap, drawSelection, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { tags } from '@lezer/highlight'
import {
  cycleHeading,
  insertSceneBreak,
  paragraphStartLines,
  toggleBulletList,
  toggleInline,
  toggleNumberedList,
  toggleQuote
} from './formatting.js'

// The CodeMirror setup for the prose editor: markdown source with its
// marks left visible, styled as it reads, paragraph numbers in the
// margin. The formatting itself is in formatting.js; this only turns it
// into CodeMirror commands.

// ---- Commands ----------------------------------------------------------

// A command from a formatting.js function of (text, from, to). It acts
// on the main selection only: with several cursors, the others are
// dropped. Returns true, as CodeMirror commands do, so a key bound to one
// isn't passed on.
function formatCommand(fn) {
  return (view) => {
    const { from, to } = view.state.selection.main
    const result = fn(view.state.doc.toString(), from, to)
    view.dispatch({
      changes: result.changes,
      selection: EditorSelection.single(result.selection.anchor, result.selection.head),
      scrollIntoView: true,
      userEvent: 'input.format'
    })
    return true
  }
}

export const commands = {
  bold: formatCommand((text, from, to) => toggleInline(text, from, to, '**')),
  italic: formatCommand((text, from, to) => toggleInline(text, from, to, '*')),
  strikethrough: formatCommand((text, from, to) => toggleInline(text, from, to, '~~')),
  heading: formatCommand(cycleHeading),
  quote: formatCommand(toggleQuote),
  bulletList: formatCommand(toggleBulletList),
  numberedList: formatCommand(toggleNumberedList),
  sceneBreak: formatCommand((text, _from, to) => insertSceneBreak(text, to))
}

// ---- Paragraph numbers -------------------------------------------------

class ParagraphNumber extends GutterMarker {
  constructor(n) {
    super()
    this.n = n
  }
  eq(other) {
    return other.n === this.n
  }
  toDOM() {
    return document.createTextNode(String(this.n))
  }
}

// The paragraph numbers as gutter markers, recomputed on each change.
// A scene is short enough that counting from the top each time is cheap.
function paragraphMarkers(doc) {
  const lines = []
  for (let i = 1; i <= doc.lines; i++) lines.push(doc.line(i).text)
  return RangeSet.of(paragraphStartLines(lines).map((line, i) => new ParagraphNumber(i + 1).range(doc.line(line).from)))
}

const paragraphField = StateField.define({
  create: (state) => paragraphMarkers(state.doc),
  update: (markers, tr) => (tr.docChanged ? paragraphMarkers(tr.state.doc) : markers)
})

// Moves the cursor to the start of paragraph n (1-based), scrolled into
// view near the top. Returns false, changing nothing, if the text has
// fewer paragraphs than that.
export function goToParagraph(view, n) {
  const doc = view.state.doc
  const lines = []
  for (let i = 1; i <= doc.lines; i++) lines.push(doc.line(i).text)
  const line = paragraphStartLines(lines)[n - 1]
  if (line === undefined) return false
  const pos = doc.line(line).from
  view.dispatch({
    selection: EditorSelection.cursor(pos),
    effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 80 })
  })
  view.focus()
  return true
}

const paragraphGutter = [
  paragraphField,
  gutter({
    class: 'cm-paragraph-numbers',
    markers: (view) => view.state.field(paragraphField)
  })
]

// ---- Styling -----------------------------------------------------------

// Text styled as it reads; the marks themselves are kept but faded.
const proseHighlight = HighlightStyle.define([
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.heading1, fontSize: '1.5em', fontWeight: '700' },
  { tag: tags.heading2, fontSize: '1.3em', fontWeight: '700' },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontSize: '1.1em', fontWeight: '700' },
  { tag: tags.quote, class: 'cm-prose-quote' },
  { tag: [tags.processingInstruction, tags.contentSeparator, tags.list], class: 'cm-prose-mark' },
  { tag: tags.monospace, class: 'cm-prose-code' },
  { tag: [tags.link, tags.url], class: 'cm-prose-link' }
])

// ---- The editor --------------------------------------------------------

// Creates the editor in `parent` with `text`. onChange(text) is called
// after each edit, onSave() on Ctrl-S. Returns the EditorView; call
// destroy() on it when done.
export function createProseEditor({ parent, text, onChange, onSave }) {
  const ownKeys = keymap.of([
    // Before the default keymap, which uses Mod-i to select the
    // surrounding syntax.
    { key: 'Mod-b', run: commands.bold },
    { key: 'Mod-i', run: commands.italic },
    { key: 'Mod-s', run: () => (onSave(), true), preventDefault: true }
  ])

  return new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        history(),
        drawSelection(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        ownKeys,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(proseHighlight),
        paragraphGutter,
        EditorView.contentAttributes.of({ spellcheck: 'true', autocorrect: 'on', 'aria-label': 'Scene prose' }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString())
        })
      ]
    })
  })
}
