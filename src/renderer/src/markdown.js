// A small markdown renderer for the prose viewer, split into a pure parser
// (here, tested with plain `node --test`) and a component that turns its
// output into React elements (Markdown.jsx).
//
// It renders ONE paragraph at a time. Paragraphs are cut out of the file
// by splitParagraphs in src/main/prose.js before they get here, so the
// numbered blocks on screen are exactly the counted paragraphs. Nothing in
// here may merge or split paragraphs; it only styles lines within one.
//
// Supported, deliberately little:
//   # heading            (levels 1-6, one line)
//   > quote              (consecutive quote lines form one quote)
//   - item, * item, 1. item  (list lines, marker kept as typed)
//   ***, ---, * * *, ___ (a paragraph that is only this is a scene break)
//   **bold**, *italic*, _italic_, `code`
// Everything else, raw HTML included, is shown as typed. The output is
// plain data, never HTML, so nothing in a file can become markup.

const BREAK = /^(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/
const QUOTE = /^>[ \t]?(.*)$/
const LIST = /^[ \t]*([-*+]|\d{1,9}[.)])[ \t]+(.*)$/

// Each alternative is one inline form; the first match in the text wins.
const INLINE = new RegExp(
  [
    '`([^`]+)`', // 1: code
    '\\*\\*(?=\\S)(.+?)(?<=\\S)\\*\\*', // 2: bold
    '\\*(?=[^\\s*])(.+?)(?<=[^\\s*])\\*', // 3: italic with *
    '(?<![\\p{L}\\p{N}])_(?=[^\\s_])(.+?)(?<=[^\\s_])_(?![\\p{L}\\p{N}])' // 4: italic with _
  ].join('|'),
  'gu'
)

// Text -> list of inline nodes: { type: 'text' | 'code', text } or
// { type: 'strong' | 'em', children }.
export function parseInline(text) {
  const nodes = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) nodes.push({ type: 'text', text: text.slice(last, m.index) })
    if (m[1] !== undefined) nodes.push({ type: 'code', text: m[1] })
    else if (m[2] !== undefined) nodes.push({ type: 'strong', children: parseInline(m[2]) })
    else nodes.push({ type: 'em', children: parseInline(m[3] ?? m[4]) })
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) })
  return nodes
}

function classify(line) {
  let m
  if ((m = HEADING.exec(line))) return { type: 'heading', level: m[1].length, inlines: parseInline(m[2]) }
  if ((m = QUOTE.exec(line))) return { type: 'quote', line: parseInline(m[1]) }
  if ((m = LIST.exec(line))) return { type: 'list', item: { marker: m[1], inlines: parseInline(m[2]) } }
  return { type: 'text', line: parseInline(line) }
}

// One paragraph (as returned by splitParagraphs) -> list of blocks:
//   { type: 'break' }
//   { type: 'heading', level, inlines }
//   { type: 'quote', lines: [inlines] }
//   { type: 'list', items: [{ marker, inlines }] }
//   { type: 'text', lines: [inlines] }   line breaks within it are kept
export function parseParagraph(paragraph) {
  if (BREAK.test(paragraph.trim())) return [{ type: 'break' }]

  const blocks = []
  for (const line of paragraph.split('\n')) {
    const c = classify(line)
    const prev = blocks[blocks.length - 1]
    if (c.type === 'heading') blocks.push(c)
    else if (c.type === 'list') {
      if (prev?.type === 'list') prev.items.push(c.item)
      else blocks.push({ type: 'list', items: [c.item] })
    } else if (prev?.type === c.type) prev.lines.push(c.line)
    else blocks.push({ type: c.type, lines: [c.line] })
  }
  return blocks
}
