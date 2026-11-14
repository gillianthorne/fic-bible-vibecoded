// The prose editor's formatting, as plain functions over the document
// text, so they're tested with plain `node --test`. No CodeMirror here:
// each returns { changes, selection } in the shape CodeMirror takes
// (changes: [{ from, to, insert }] against the original text, selection:
// { anchor, head } after them), and proseEditor.js applies it.

// ---- Inline marks: bold **, italic *, strikethrough ~~ ----------------

// Whether a run of n marker characters carries the mark. Bold and italic
// share *, so a run of 1 is italic, 2 is bold, 3 or more is both.
function carries(marker, run) {
  if (marker === '*') return run === 1 || run >= 3
  if (marker === '**') return run === 2 || run >= 3
  return run >= marker.length
}

function runAt(text, i, char, step) {
  let n = 0
  while (text[i + n * step] === char) n++
  return n
}

// Where to put the marks around [from, to): each paragraph in it on its
// own, since a mark can't cross a blank line, and with the spaces at
// either end left outside, since `**word **` isn't bold.
function segments(text, from, to) {
  const out = []
  const blank = /\n[^\S\n]*\n\s*/g
  let start = from
  const slice = text.slice(from, to)
  let m
  while ((m = blank.exec(slice)) !== null) {
    out.push([start, from + m.index])
    start = from + m.index + m[0].length
  }
  out.push([start, to])
  return out
    .map(([a, b]) => {
      while (a < b && /\s/.test(text[a])) a++
      while (b > a && /\s/.test(text[b - 1])) b--
      return [a, b]
    })
    .filter(([a, b]) => a < b)
}

// Where a position ends up after changes (sorted, against the original
// text). At an insertion exactly at pos, assoc -1 stays before the
// inserted text and 1 goes after it.
export function mapPos(changes, pos, assoc = 1) {
  let delta = 0
  for (const c of changes) {
    const removed = c.to - c.from
    if (c.to < pos || (c.to === pos && (c.from < pos || assoc > 0))) delta += c.insert.length - removed
    else if (c.from < pos) return c.from + delta + (assoc > 0 ? c.insert.length : 0)
    else break
  }
  return pos + delta
}

const result = (changes, from, to) =>
  from === to
    ? { changes, selection: { anchor: mapPos(changes, from, 1), head: mapPos(changes, to, 1) } }
    : { changes, selection: { anchor: mapPos(changes, from, -1), head: mapPos(changes, to, 1) } }

// Toggles marker around the selection [from, to), a paragraph at a time:
// - if every paragraph selected starts and ends with the mark, it's taken
//   off each: `**word**` selected becomes `word`
// - if the mark sits just outside the selection, it's taken off:
//   `**word**` with only word selected becomes `word`
// - otherwise each paragraph selected is wrapped; an empty selection gets
//   an empty pair with the cursor between
// The selection afterwards covers the same text, marks included, so
// pressing the button again takes them off.
export function toggleInline(text, from, to, marker) {
  const char = marker[0]
  const n = marker.length
  const parts = segments(text, from, to)

  const wrappedInside = ([a, b]) => {
    const part = text.slice(a, b)
    const lead = runAt(part, 0, char, 1)
    const trail = runAt(part, part.length - 1, char, -1)
    return part.length >= 2 * n && lead < part.length && carries(marker, Math.min(lead, trail))
  }
  if (parts.length > 0 && parts.every(wrappedInside)) {
    const changes = parts.flatMap(([a, b]) => [
      { from: a, to: a + n, insert: '' },
      { from: b - n, to: b, insert: '' }
    ])
    return result(changes, from, to)
  }

  const one = parts.length === 1 ? parts[0] : from === to ? [from, to] : null
  if (one) {
    const [a, b] = one
    if (carries(marker, Math.min(runAt(text, a - 1, char, -1), runAt(text, b, char, 1)))) {
      const changes = [
        { from: a - n, to: a, insert: '' },
        { from: b, to: b + n, insert: '' }
      ]
      return result(changes, from, to)
    }
  }

  if (from === to) {
    return { changes: [{ from, to, insert: marker + marker }], selection: { anchor: from + n, head: from + n } }
  }
  const changes = parts.flatMap(([a, b]) => [
    { from: a, to: a, insert: marker },
    { from: b, to: b, insert: marker }
  ])
  return result(changes, from, to)
}

// ---- Line prefixes: heading, blockquote, lists ------------------------

// The lines [first, last] that the selection [from, to) touches, as
// { from, text } with from an offset into the document.
function linesOf(text, from, to) {
  const start = text.lastIndexOf('\n', from - 1) + 1
  let end = text.indexOf('\n', to)
  if (end === -1) end = text.length
  const lines = []
  let at = start
  for (const line of text.slice(start, end).split('\n')) {
    lines.push({ from: at, text: line })
    at += line.length + 1
  }
  return lines
}

const isBlank = (line) => !/\S/.test(line.text)

// Applies a per-line rewrite, given as (line, index among non-blank lines)
// -> { strip: n, insert: s }: remove n characters from the line's start,
// then insert s. Blank lines are left alone. The selection is kept over
// the same lines.
function rewriteLines(text, from, to, rewrite) {
  const lines = linesOf(text, from, to)
  const changes = []
  let i = 0
  for (const line of lines) {
    if (isBlank(line)) continue
    const { strip, insert } = rewrite(line, i++)
    if (strip === 0 && insert === '') continue
    changes.push({ from: line.from, to: line.from + strip, insert })
  }
  return result(changes, from, to)
}

// Toggles a prefix on every non-blank line touched: if they all have it
// (as matched by `has`), it comes off; otherwise it goes on each line
// that lacks it.
function togglePrefix(text, from, to, has, make) {
  const lines = linesOf(text, from, to).filter((l) => !isBlank(l))
  const all = lines.length > 0 && lines.every((l) => has.test(l.text))
  return rewriteLines(text, from, to, (line, i) => {
    const current = has.exec(line.text)?.[0] ?? ''
    if (all) return { strip: current.length, insert: '' }
    return current ? { strip: 0, insert: '' } : { strip: 0, insert: make(i) }
  })
}

export const toggleQuote = (text, from, to) => togglePrefix(text, from, to, /^>[^\S\n]?/, () => '> ')

export const toggleBulletList = (text, from, to) => togglePrefix(text, from, to, /^[-+*][^\S\n]+(?!\*)/, () => '- ')

export const toggleNumberedList = (text, from, to) => togglePrefix(text, from, to, /^\d+[.)][^\S\n]+/, (i) => `${i + 1}. `)

// Cycles the heading level of the lines touched: none -> # -> ## -> ###
// -> none, going by the first non-blank line.
export function cycleHeading(text, from, to) {
  const HEADING = /^(#{1,6})[^\S\n]+/
  const first = linesOf(text, from, to).find((l) => !isBlank(l))
  const level = first ? (HEADING.exec(first.text)?.[1].length ?? 0) : 0
  const next = level === 0 ? 1 : level >= 3 ? 0 : level + 1
  return rewriteLines(text, from, to, (line) => ({
    strip: HEADING.exec(line.text)?.[0].length ?? 0,
    insert: next === 0 ? '' : '#'.repeat(next) + ' '
  }))
}

// ---- Scene break -------------------------------------------------------

// Puts a scene break (***) as its own paragraph after the line the cursor
// is on, or on that line if it's blank, with blank lines either side so
// it doesn't run into the text around it. The cursor goes after it.
export function insertSceneBreak(text, pos) {
  const [line] = linesOf(text, pos, pos)
  const end = line.from + line.text.length
  const nonBlankAt = (i) => i >= 0 && i <= text.length && /\S/.test(linesOf(text, i, i)[0].text)
  const nextNonBlank = end < text.length && nonBlankAt(end + 1)
  let from = end
  let insert
  if (isBlank(line)) {
    from = line.from
    insert = (line.from > 0 && nonBlankAt(line.from - 1) ? '\n' : '') + '***'
  } else {
    insert = '\n\n***'
  }
  const cursor = from + insert.length
  if (nextNonBlank) insert += '\n'
  return { changes: [{ from, to: end, insert }], selection: { anchor: cursor, head: cursor } }
}

// ---- Paragraph numbers -------------------------------------------------

// The 1-based line numbers where each paragraph starts, numbered as
// splitParagraphs (src/main/prose.js) numbers them: a paragraph is a run
// of non-blank lines, and a blank line is empty or whitespace only. Entry
// i is the line paragraph i + 1 starts on.
export function paragraphStartLines(lines) {
  const starts = []
  let inParagraph = false
  lines.forEach((line, i) => {
    const blank = !/\S/.test(line)
    if (!blank && !inParagraph) starts.push(i + 1)
    inParagraph = !blank
  })
  return starts
}
