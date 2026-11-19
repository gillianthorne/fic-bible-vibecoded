import fs from 'node:fs'
import path from 'node:path'
import { chapterProse } from './queries.js'
import { parseParagraph } from '../renderer/src/markdown.js'

// Exporting a whole chapter to a new file: .html for pasting into AO3's
// HTML box, .md for sending to someone to edit. No Electron imports, so
// this is tested with plain `node --test`.
//
// The write boundary (docs/spec.md, File handling): an export writes one
// new file at the path the author picked. It never writes over an existing
// file (the 'wx' flag fails if one is there) and never anywhere inside the
// library folder.

export const SCENE_SEPARATOR = '~*~'

export const FORMATS = { html: '.html', md: '.md' }

function requireFormat(format) {
  if (!Object.hasOwn(FORMATS, format)) throw new Error(`Unknown export format ${JSON.stringify(format)}`)
  return format
}

// ---- HTML -------------------------------------------------------------

// Text only ever lands between tags, never in an attribute, so quotes are
// left as typed: they read better in AO3's HTML box.
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ~~struck~~ inside a run of plain text. The viewer's parser doesn't know
// strikethrough, but the editor's toolbar makes it, so a post should show it.
const STRIKE = /~~(?=\S)(.+?)(?<=\S)~~/g

const textHtml = (t) => escape(t).replace(STRIKE, '<s>$1</s>')

function inlinesHtml(nodes) {
  return nodes
    .map((n) => {
      if (n.type === 'text') return textHtml(n.text)
      if (n.type === 'code') return `<code>${escape(n.text)}</code>`
      const tag = n.type === 'strong' ? 'strong' : 'em'
      return `<${tag}>${inlinesHtml(n.children)}</${tag}>`
    })
    .join('')
}

const linesHtml = (lines) => lines.map(inlinesHtml).join('<br />\n')

const separatorHtml = `<p>${SCENE_SEPARATOR}</p>`

function blockHtml(block) {
  switch (block.type) {
    case 'break':
      return separatorHtml
    case 'heading':
      return `<h${block.level}>${inlinesHtml(block.inlines)}</h${block.level}>`
    case 'quote':
      return `<blockquote><p>${linesHtml(block.lines)}</p></blockquote>`
    case 'list': {
      const tag = /^\d/.test(block.items[0].marker) ? 'ol' : 'ul'
      const items = block.items.map((item) => `  <li>${inlinesHtml(item.inlines)}</li>`).join('\n')
      return `<${tag}>\n${items}\n</${tag}>`
    }
    default:
      return `<p>${linesHtml(block.lines)}</p>`
  }
}

const sceneHtml = (paragraphs) => paragraphs.flatMap(parseParagraph).map(blockHtml).join('\n')

// ---- Assembly ---------------------------------------------------------

// The scenes with text, in order. A scene whose file can't be read stops
// the export rather than leaving a gap in it.
function scenesWithText(chapter) {
  const unread = chapter.scenes.filter((s) => s.paragraphs === null)
  if (unread.length > 0) {
    const names = unread.map((s) => `“${s.title}” (${s.fileError})`).join(', ')
    throw new Error(`Couldn’t read ${unread.length === 1 ? 'a scene' : 'some scenes'}, so nothing was exported: ${names}`)
  }
  return chapter.scenes.filter((s) => s.paragraphs.length > 0)
}

export function chapterHtml(chapter) {
  return scenesWithText(chapter).map((s) => sceneHtml(s.paragraphs)).join(`\n\n${separatorHtml}\n\n`) + '\n'
}

export function chapterMarkdown(chapter) {
  const scenes = scenesWithText(chapter).map((s) => s.paragraphs.join('\n\n'))
  const heading = `# Chapter ${chapter.number}: ${chapter.title}`
  if (scenes.length === 0) return heading + '\n'
  return `${heading}\n\n${scenes.join(`\n\n${SCENE_SEPARATOR}\n\n`)}\n`
}

// ---- File -------------------------------------------------------------

const BAD_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/g

// "Chapter 3 - The Long Night.html", with characters Windows can't hold
// in a file name swapped for a dash.
export function exportFilename(chapter, format) {
  const name = `Chapter ${chapter.number} - ${chapter.title}`.replace(BAD_CHARACTERS, '-').replace(/[. ]+$/, '')
  return name + FORMATS[requireFormat(format)]
}

// The assembled chapter for the given format. Returns null for an unknown
// chapter.
export function buildChapterExport(db, libraryRoot, chapterId, format) {
  requireFormat(format)
  const chapter = chapterProse(db, libraryRoot, chapterId)
  if (!chapter) return null
  return {
    filename: exportFilename(chapter, format),
    text: format === 'html' ? chapterHtml(chapter) : chapterMarkdown(chapter)
  }
}

function realpathOrSelf(p) {
  try {
    return fs.realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}

function isInside(dir, target) {
  const rel = path.relative(dir, target)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

// Writes `text` to a new file at `file`, adding the format's extension if
// the name doesn't have it. Refuses a path inside the library folder, and
// an existing file. Returns the path written.
export function writeExport(file, text, format, libraryRoot) {
  const ext = FORMATS[requireFormat(format)]
  let target = path.resolve(file)
  if (path.extname(target).toLowerCase() !== ext) target += ext

  // Compare real paths (and, on Windows, without case) so a link or a
  // differently-cased path can't slip into the library.
  const root = realpathOrSelf(libraryRoot)
  const where = path.join(realpathOrSelf(path.dirname(target)), path.basename(target))
  const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p)
  if (isInside(fold(root), fold(where))) {
    throw new Error('Exports can’t be saved inside the library folder, so nothing was written. Pick a folder outside it.')
  }

  try {
    fs.writeFileSync(target, text, { encoding: 'utf8', flag: 'wx' })
  } catch (e) {
    if (e.code === 'EEXIST') {
      throw new Error(`“${path.basename(target)}” already exists. Export never replaces a file; pick a new name.`)
    }
    throw e
  }
  return target
}
