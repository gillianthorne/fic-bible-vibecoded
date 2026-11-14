// The prose editor's formatting helpers, applied to plain strings.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cycleHeading,
  insertSceneBreak,
  paragraphStartLines,
  toggleBulletList,
  toggleInline,
  toggleNumberedList,
  toggleQuote
} from '../src/renderer/src/formatting.js'
import { splitParagraphs } from '../src/main/prose.js'

// Applies a { changes, selection } result. Returns the new text with the
// selection marked [like this], or | for a cursor.
function apply(text, { changes, selection }) {
  let out = text
  for (const c of [...changes].sort((a, b) => b.from - a.from)) out = out.slice(0, c.from) + c.insert + out.slice(c.to)
  const [a, b] = [selection.anchor, selection.head].sort((x, y) => x - y)
  return a === b ? out.slice(0, a) + '|' + out.slice(a) : out.slice(0, a) + '[' + out.slice(a, b) + ']' + out.slice(b)
}

// Runs fn on text written with the selection marked the same way.
function run(fn, marked, ...args) {
  const cursor = marked.indexOf('|')
  if (cursor !== -1) {
    const text = marked.replace('|', '')
    return apply(text, fn(text, cursor, cursor, ...args))
  }
  const from = marked.indexOf('[')
  const to = marked.indexOf(']') - 1
  const text = marked.replace('[', '').replace(']', '')
  return apply(text, fn(text, from, to, ...args))
}

test('bold wraps the selection, and wrapping again takes it off', () => {
  assert.equal(run(toggleInline, 'She said [nothing].', '**'), 'She said [**nothing**].')
  assert.equal(run(toggleInline, 'She said [**nothing**].', '**'), 'She said [nothing].')
})

test('bold comes off when only the text inside the marks is selected', () => {
  assert.equal(run(toggleInline, 'She said **[nothing]**.', '**'), 'She said [nothing].')
})

test('an empty selection gets an empty pair, and toggling again removes it', () => {
  assert.equal(run(toggleInline, 'Say |', '**'), 'Say **|**')
  assert.equal(run(toggleInline, 'Say **|**', '**'), 'Say |')
})

test('spaces at the ends of the selection stay outside the marks', () => {
  assert.equal(run(toggleInline, 'one[ two ]three', '*'), 'one[ *two* ]three')
})

test('italic and bold share * without confusing each other', () => {
  assert.equal(run(toggleInline, '[**bold**]', '*'), '[***bold***]')
  assert.equal(run(toggleInline, '[*it*]', '**'), '[***it***]')
  assert.equal(run(toggleInline, '[***both***]', '**'), '[*both*]')
  assert.equal(run(toggleInline, '[***both***]', '*'), '[**both**]')
  assert.equal(run(toggleInline, '**[bold]**', '*'), '**[*bold*]**')
})

test('a selection across paragraphs is marked one paragraph at a time, and unmarked the same way', () => {
  assert.equal(run(toggleInline, '[one\n\ntwo]', '*'), '[*one*\n\n*two*]')
  assert.equal(run(toggleInline, '[*one*\n\n*two*]', '*'), '[one\n\ntwo]')
})

test('strikethrough uses ~~', () => {
  assert.equal(run(toggleInline, '[gone]', '~~'), '[~~gone~~]')
  assert.equal(run(toggleInline, '~~[gone]~~', '~~'), '[gone]')
})

test('blockquote goes on every line touched, and comes off when all have it', () => {
  assert.equal(run(toggleQuote, '[one\ntwo]'), '[> one\n> two]')
  assert.equal(run(toggleQuote, '> o[ne\n> tw]o'), 'o[ne\ntw]o')
  assert.equal(run(toggleQuote, 'a|b'), '> a|b')
})

test('blank lines are left alone', () => {
  assert.equal(run(toggleQuote, '[one\n\ntwo]'), '[> one\n\n> two]')
})

test('lists: bullets and numbers toggle', () => {
  assert.equal(run(toggleBulletList, '[a\nb]'), '[- a\n- b]')
  assert.equal(run(toggleBulletList, '[- a\n- b]'), '[a\nb]')
  assert.equal(run(toggleNumberedList, '[a\nb\nc]'), '[1. a\n2. b\n3. c]')
  assert.equal(run(toggleNumberedList, '[1. a\n2. b]'), '[a\nb]')
})

test('a scene break line is not mistaken for a bullet', () => {
  assert.equal(run(toggleBulletList, '[* * *]'), '[- * * *]')
})

test('heading cycles none, #, ##, ###, none', () => {
  assert.equal(run(cycleHeading, 'Ti|tle'), '# Ti|tle')
  assert.equal(run(cycleHeading, '# Ti|tle'), '## Ti|tle')
  assert.equal(run(cycleHeading, '## Ti|tle'), '### Ti|tle')
  assert.equal(run(cycleHeading, '### Ti|tle'), 'Ti|tle')
})

test('scene break goes after the line, or on it if blank, always as its own paragraph', () => {
  assert.equal(run(insertSceneBreak, 'End of | part.'), 'End of  part.\n\n***|')
  assert.equal(run(insertSceneBreak, 'End of | part.\nMore'), 'End of  part.\n\n***|\n\nMore')
  assert.equal(run(insertSceneBreak, 'End.|\n\nMore'), 'End.\n\n***|\n\nMore')
  assert.equal(run(insertSceneBreak, 'One\n|\nTwo'), 'One\n\n***|\n\nTwo')
  assert.equal(run(insertSceneBreak, 'One\n\n|\n\nTwo'), 'One\n\n***|\n\nTwo')
  assert.equal(run(insertSceneBreak, '|'), '***|')
})

test('paragraph numbers start where splitParagraphs says paragraphs are', () => {
  const samples = [
    '',
    'One',
    'One\ntwo\n\nThree',
    '\n\n  \nOne\n \t \nTwo\n\n\n\nThree\nfour\n',
    '# Heading\n\n***\n\n> quote\n> more'
  ]
  for (const text of samples) {
    const lines = text.split('\n')
    const starts = paragraphStartLines(lines)
    assert.equal(starts.length, splitParagraphs(text).length, JSON.stringify(text))
    starts.forEach((line, i) => assert.ok(splitParagraphs(text)[i].startsWith(lines[line - 1].trim())))
  }
})
