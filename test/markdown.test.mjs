import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseInline, parseParagraph } from '../src/renderer/src/markdown.js'
import { splitParagraphs } from '../src/main/prose.js'

const text = (t) => ({ type: 'text', text: t })

test('plain text is one text block, line breaks kept', () => {
  assert.deepEqual(parseParagraph('one two\nthree'), [{ type: 'text', lines: [[text('one two')], [text('three')]] }])
})

test('bold, italic and code inline', () => {
  assert.deepEqual(parseInline('a **b** *c* _d_ `e`'), [
    text('a '),
    { type: 'strong', children: [text('b')] },
    text(' '),
    { type: 'em', children: [text('c')] },
    text(' '),
    { type: 'em', children: [text('d')] },
    text(' '),
    { type: 'code', text: 'e' }
  ])
})

test('italic inside bold', () => {
  assert.deepEqual(parseInline('**a *b* c**'), [
    { type: 'strong', children: [text('a '), { type: 'em', children: [text('b')] }, text(' c')] }
  ])
})

test('markup inside code is left alone', () => {
  assert.deepEqual(parseInline('`**x**`'), [{ type: 'code', text: '**x**' }])
})

test('things that only look like markup are shown as typed', () => {
  for (const s of ['snake_case_name', '2 * 3 * 4', 'a lone * star', '** spaced **', 'unclosed *italic', 'a ` tick']) {
    assert.deepEqual(parseInline(s), [text(s)], s)
  }
})

test('raw HTML stays text', () => {
  assert.deepEqual(parseParagraph('<b>hi</b> <script>x</script>'), [
    { type: 'text', lines: [[text('<b>hi</b> <script>x</script>')]] }
  ])
})

test('a heading line followed by text stays in one paragraph as two blocks', () => {
  assert.deepEqual(parseParagraph('## Part *two*\nShe left.'), [
    { type: 'heading', level: 2, inlines: [text('Part '), { type: 'em', children: [text('two')] }] },
    { type: 'text', lines: [[text('She left.')]] }
  ])
})

test('# without a space is not a heading', () => {
  assert.deepEqual(parseParagraph('#hashtag'), [{ type: 'text', lines: [[text('#hashtag')]] }])
})

test('consecutive quote lines form one quote', () => {
  assert.deepEqual(parseParagraph('> one\n> two'), [{ type: 'quote', lines: [[text('one')], [text('two')]] }])
})

test('list lines keep their markers', () => {
  assert.deepEqual(parseParagraph('- a\n* b\n3. c'), [
    {
      type: 'list',
      items: [
        { marker: '-', inlines: [text('a')] },
        { marker: '*', inlines: [text('b')] },
        { marker: '3.', inlines: [text('c')] }
      ]
    }
  ])
})

test('a paragraph that is only a rule is a scene break', () => {
  for (const s of ['***', '---', '* * *', '___', '- - - -']) {
    assert.deepEqual(parseParagraph(s), [{ type: 'break' }], s)
  }
  assert.notDeepEqual(parseParagraph('**'), [{ type: 'break' }])
  assert.notDeepEqual(parseParagraph('text\n***'), [{ type: 'break' }])
})

test('one block list per counted paragraph: rendering never changes the count', () => {
  const file = '# Title\nFirst line.\n\n***\r\n\r\n> quoted\n- item\n\n\n\nlast'
  const paragraphs = splitParagraphs(file)
  assert.equal(paragraphs.length, 4)
  for (const p of paragraphs) assert.ok(parseParagraph(p).length >= 1)
})
