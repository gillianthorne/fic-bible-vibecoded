// Pure prose counting: no Electron, no file access, so it can be tested
// with plain `node --test`.
//
// Provisional definitions (spec not yet available):
// - A paragraph is a block of text separated from the next by one or more
//   blank lines (lines that are empty or whitespace only).
// - A word is a run of non-whitespace characters. Markdown markers such as
//   `#` or `*` count as words when they stand alone.

function normalise(text) {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
}

export function splitParagraphs(text) {
  return normalise(text)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

export function countWords(text) {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

export function countProse(text) {
  const paragraphs = splitParagraphs(text)
  return {
    paragraphs: paragraphs.length,
    words: paragraphs.reduce((sum, p) => sum + countWords(p), 0)
  }
}
