import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { countProse, countWords, splitParagraphs } from '../src/main/prose.js'

test('empty and whitespace-only text has nothing', () => {
  assert.deepEqual(countProse(''), { paragraphs: 0, words: 0 })
  assert.deepEqual(countProse(' \n\n \t\n'), { paragraphs: 0, words: 0 })
})

test('a single line is one paragraph', () => {
  assert.deepEqual(countProse('She closed the door.'), { paragraphs: 1, words: 4 })
})

test('lines without a blank line between them stay one paragraph', () => {
  assert.deepEqual(countProse('one two\nthree four'), { paragraphs: 1, words: 4 })
})

test('LF and CRLF give the same result', () => {
  const lf = 'one two\n\nthree\n\nfour five six'
  assert.deepEqual(countProse(lf), { paragraphs: 3, words: 6 })
  assert.deepEqual(countProse(lf.replace(/\n/g, '\r\n')), countProse(lf))
})

test('several blank lines, or whitespace-only lines, count as one break', () => {
  assert.deepEqual(splitParagraphs('a\n\n\n\nb\n  \t \nc'), ['a', 'b', 'c'])
})

test('a leading byte-order mark is not part of the first word', () => {
  assert.deepEqual(splitParagraphs('﻿hello world'), ['hello world'])
})

test('any run of whitespace separates words', () => {
  assert.equal(countWords('  one\t two   three  '), 3)
})

test('the library test scene: 3 paragraphs, 143 words (wc -w)', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const file = path.join(here, '..', 'library', 'test-fic', 'chapter-1', 'scene-1.md')
  assert.deepEqual(countProse(fs.readFileSync(file, 'utf8')), { paragraphs: 3, words: 143 })
})
