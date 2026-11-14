// Links in the app (work link, chapter link, URLs in notes) are handed to
// the user's default browser; the app itself never fetches them (spec:
// Platform and stack, Links). No Electron imports, so this is tested with
// plain `node --test`.
//
// Only http and https are opened. Anything else (file:, javascript:,
// custom protocol handlers) is refused, since the text comes from notes
// typed into the app and the OS would otherwise act on whatever it names.

const ALLOWED = new Set(['http:', 'https:'])

// Returns the URL as the browser should get it, or throws.
export function checkLink(value) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error('No link given')
  let url
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error(`Not a link: ${value}`)
  }
  if (!ALLOWED.has(url.protocol)) throw new Error(`Only http and https links can be opened, not ${url.protocol}`)
  return url.href
}
