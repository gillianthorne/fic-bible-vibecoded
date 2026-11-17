import { EditorSelection, EditorState, RangeSet, StateEffect, StateField } from '@codemirror/state'
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

// A paragraph number, with the paragraph's edit-note counts before it
// (spec: Scene prose editor): a small numbered badge per status, in the
// order open, fixed, ignored, cut, matching the viewer's NoteCounts.
// counts is those [status, count] pairs. The counts and the number are
// buttons: the counts open the paragraph's notes, the number opens them
// ready to add one. Clicks are handled by the gutter's click handler
// below.
class ParagraphNumber extends GutterMarker {
  constructor(n, counts) {
    super()
    this.n = n
    this.counts = counts
    this.key = counts.map(([s, c]) => `${s}${c}`).join()
  }
  eq(other) {
    return other.n === this.n && other.key === this.key
  }
  toDOM() {
    const wrap = document.createElement('span')
    if (this.counts.length > 0) {
      const total = this.counts.reduce((sum, [, c]) => sum + c, 0)
      const words = `${this.counts.map(([s, c]) => `${c} ${s}`).join(', ')} edit note${total === 1 ? '' : 's'}`
      const group = document.createElement('button')
      group.type = 'button'
      group.className = 'note-counts'
      group.dataset.paragraph = String(this.n)
      group.dataset.noteAnchor = ''
      group.title = `${words}: click to view`
      group.setAttribute('aria-label', `Paragraph ${this.n}: ${words}, view`)
      for (const [status, c] of this.counts) {
        const badge = document.createElement('span')
        badge.className = `note-count note-count-${status}`
        badge.textContent = String(c)
        group.append(badge)
      }
      wrap.append(group)
    }
    const number = document.createElement('button')
    number.type = 'button'
    number.className = 'cm-paragraph-number'
    number.dataset.paragraph = String(this.n)
    number.dataset.noteAnchor = ''
    number.textContent = String(this.n)
    number.title = `Add an edit note at paragraph ${this.n}`
    number.setAttribute('aria-label', `Paragraph ${this.n}: add an edit note`)
    wrap.append(number)
    return wrap
  }
}

// Edit-note counts by paragraph number, each a list of [status, count]
// pairs, set from outside the editor with setNoteCounts whenever the
// notes are read.
export const setNoteCounts = StateEffect.define()

const noteCountsField = StateField.define({
  create: () => new Map(),
  update: (counts, tr) => tr.effects.reduce((acc, e) => (e.is(setNoteCounts) ? e.value : acc), counts)
})

// The paragraph numbers as gutter markers, recomputed on each change.
// A scene is short enough that counting from the top each time is cheap.
// Counts go by paragraph number as it is now, while typing, the same way
// a note's paragraph points at the file.
function paragraphMarkers(state) {
  const doc = state.doc
  const counts = state.field(noteCountsField)
  const lines = []
  for (let i = 1; i <= doc.lines; i++) lines.push(doc.line(i).text)
  return RangeSet.of(
    paragraphStartLines(lines).map((line, i) => new ParagraphNumber(i + 1, counts.get(i + 1) ?? []).range(doc.line(line).from))
  )
}

const paragraphField = StateField.define({
  create: (state) => paragraphMarkers(state),
  update: (markers, tr) =>
    tr.docChanged || tr.effects.some((e) => e.is(setNoteCounts)) ? paragraphMarkers(tr.state) : markers
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

// onNotes(paragraph, element, adding) is called when a count (adding
// false) or a paragraph number (adding true) is clicked.
const paragraphGutter = (onNotes) => [
  noteCountsField,
  paragraphField,
  gutter({
    class: 'cm-paragraph-numbers',
    markers: (view) => view.state.field(paragraphField),
    domEventHandlers: {
      mousedown: (_view, _line, event) => Boolean(event.target.closest?.('[data-note-anchor]')),
      click: (_view, _line, event) => {
        const anchor = event.target.closest?.('[data-note-anchor]')
        if (!anchor) return false
        onNotes(Number(anchor.dataset.paragraph), anchor, anchor.classList.contains('cm-paragraph-number'))
        return true
      }
    }
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
// after each edit, onSave() on Ctrl-S, onNotes(paragraph, element,
// adding) when an edit-note count or a paragraph number in the margin is
// clicked. Without onNotes there's no margin at all: a character's notes
// have no paragraph numbers or edit notes. label is the text area's
// accessible name. Returns the EditorView; call destroy() on it when done.
export function createProseEditor({ parent, text, onChange, onSave, onNotes, label = 'Scene prose' }) {
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
        onNotes ? paragraphGutter(onNotes) : [],
        EditorView.contentAttributes.of({ spellcheck: 'true', autocorrect: 'on', 'aria-label': label }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString())
        })
      ]
    })
  })
}
