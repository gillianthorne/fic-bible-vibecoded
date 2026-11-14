// Finds http(s) URLs in plain text, so notes can show them as links.
// Returns [{ type: 'text', text } | { type: 'link', text }] in order. A
// trailing full stop, comma or closing bracket is left out of the link, as
// in "see https://imgur.com/a/xyz." at the end of a sentence. Opening is
// checked again in the main process (src/main/links.js); this only decides
// what looks like a link.

const URL_PATTERN = /https?:\/\/[^\s<>"]+/g
const TRAILING = /[.,;:!?)\]}'"]+$/

export function splitLinks(text) {
  const parts = []
  let last = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    const link = match[0].replace(TRAILING, '')
    if (link === 'http://' || link === 'https://') continue
    if (match.index > last) parts.push({ type: 'text', text: text.slice(last, match.index) })
    parts.push({ type: 'link', text: link })
    last = match.index + link.length
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) })
  return parts
}
