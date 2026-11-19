// Chapter export: the .html and .md it builds, and the write boundary.
// The handler test uses the Electron-built SQLite module: run through
// `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MARKER } from '../scripts/seed/guard.mjs'
import { DB_NAME, seed } from '../scripts/seed/seed.mjs'
import { openSqlite } from '../src/main/sqlite.js'
import { createHandlers } from '../src/main/handlers.js'
import { chapterHtml, chapterMarkdown, exportFilename, writeExport } from '../src/main/export.js'

const scene = (title, paragraphs) => ({ title, paragraphs, fileError: null })
const chapter = (scenes) => ({ number: 3, title: 'The Long Night', scenes })

const tmp = (prefix) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))

test('html: paragraphs, inline marks and line breaks, scenes joined by ~*~, no titles', () => {
  const html = chapterHtml(
    chapter([
      scene('Arrival', ['She *ran*.', '**Stop**, he said.\nShe didn’t.']),
      scene('Empty', []),
      scene('After', ['It was ~~over~~ done.'])
    ])
  )
  assert.equal(
    html,
    '<p>She <em>ran</em>.</p>\n' +
      '<p><strong>Stop</strong>, he said.<br />\nShe didn’t.</p>\n\n' +
      '<p>~*~</p>\n\n' +
      '<p>It was <s>over</s> done.</p>\n'
  )
  assert.ok(!html.includes('Arrival'))
  assert.ok(!html.includes('<html'))
})

test('html: a scene break inside a scene is ~*~, and ~*~ typed stays as typed', () => {
  assert.equal(chapterHtml(chapter([scene('A', ['one', '***', 'two', '~*~', 'three'])])),
    '<p>one</p>\n<p>~*~</p>\n<p>two</p>\n<p>~*~</p>\n<p>three</p>\n')
})

test('html: quotes, lists and headings', () => {
  const html = chapterHtml(chapter([scene('A', ['> a\n> b', '- x\n- *y*', '1. one\n2. two', '## Part'])]))
  assert.equal(
    html,
    '<blockquote><p>a<br />\nb</p></blockquote>\n' +
      '<ul>\n  <li>x</li>\n  <li><em>y</em></li>\n</ul>\n' +
      '<ol>\n  <li>one</li>\n  <li>two</li>\n</ol>\n' +
      '<h2>Part</h2>\n'
  )
})

test('html: raw html in a scene is escaped, never markup', () => {
  assert.equal(
    chapterHtml(chapter([scene('A', ['<script>x</script> & "q" `<b>`'])])),
    '<p>&lt;script&gt;x&lt;/script&gt; &amp; "q" <code>&lt;b&gt;</code></p>\n'
  )
})

test('md: chapter heading, each scene as written, ~*~ between scenes', () => {
  assert.equal(
    chapterMarkdown(chapter([scene('A', ['She *ran*.', 'line\nbreak']), scene('B', []), scene('C', ['***', 'end'])])),
    '# Chapter 3: The Long Night\n\nShe *ran*.\n\nline\nbreak\n\n~*~\n\n***\n\nend\n'
  )
  assert.equal(chapterMarkdown(chapter([])), '# Chapter 3: The Long Night\n')
})

test('a scene that can’t be read stops the export and is named', () => {
  const ch = chapter([scene('Fine', ['ok']), { title: 'Lost', paragraphs: null, fileError: 'ENOENT' }])
  assert.throws(() => chapterHtml(ch), /nothing was exported: “Lost” \(ENOENT\)/)
  assert.throws(() => chapterMarkdown(ch), /“Lost”/)
})

test('filename is the chapter number and title, safe on Windows', () => {
  assert.equal(exportFilename(chapter([]), 'html'), 'Chapter 3 - The Long Night.html')
  assert.equal(exportFilename({ number: 1, title: 'What? Now: 1/2.' }, 'md'), 'Chapter 1 - What- Now- 1-2.md')
  assert.throws(() => exportFilename(chapter([]), 'pdf'), /Unknown export format/)
})

test('write: new file, extension added if missing', () => {
  const lib = tmp('fic-bible-exp-lib-')
  const out = tmp('fic-bible-exp-out-')
  const written = writeExport(path.join(out, 'ch3'), 'hello', 'md', lib)
  assert.equal(written, path.join(out, 'ch3.md'))
  assert.equal(fs.readFileSync(written, 'utf8'), 'hello')
})

test('write: never over an existing file', () => {
  const lib = tmp('fic-bible-exp-lib-')
  const out = tmp('fic-bible-exp-out-')
  const file = path.join(out, 'ch.html')
  fs.writeFileSync(file, 'precious')
  assert.throws(() => writeExport(file, 'new', 'html', lib), /already exists/)
  assert.equal(fs.readFileSync(file, 'utf8'), 'precious')
})

test('write: never inside the library folder, at any depth or case', () => {
  const lib = tmp('fic-bible-exp-lib-')
  fs.mkdirSync(path.join(lib, 'Work', 'chapters'), { recursive: true })
  for (const file of [path.join(lib, 'x.md'), path.join(lib, 'Work', 'chapters', 'x.md')]) {
    assert.throws(() => writeExport(file, 'x', 'md', lib), /inside the library folder/)
    assert.ok(!fs.existsSync(file))
  }
  if (process.platform === 'win32') {
    assert.throws(() => writeExport(path.join(lib.toUpperCase(), 'y.md'), 'x', 'md', lib), /inside the library/)
  }
})

test('handler: builds from the library, asks where, writes there', async () => {
  const root = tmp('fic-bible-exp-seed-')
  fs.writeFileSync(path.join(root, MARKER), '')
  seed(root)
  const db = openSqlite(path.join(root, DB_NAME))
  try {
    const out = tmp('fic-bible-exp-out-')
    const asked = []
    const exporter = {
      chooseFile: async (name, format) => {
        asked.push([name, format])
        return path.join(out, name)
      }
    }
    const handlers = createHandlers(() => ({ db, libraryRoot: root }), null, null, exporter)
    const { id, number, title } = db.prepare('SELECT id, number, title FROM chapters ORDER BY id LIMIT 1').get()

    const md = await handlers['chapter:export'](id, 'md')
    assert.equal(md.ok, true, md.error)
    assert.ok(fs.readFileSync(md.data, 'utf8').startsWith(`# Chapter ${number}: ${title}\n`))

    const html = await handlers['chapter:export'](id, 'html')
    assert.equal(html.ok, true, html.error)
    assert.ok(fs.readFileSync(html.data, 'utf8').startsWith('<'))
    assert.deepEqual(asked.map((a) => a[1]), ['md', 'html'])

    // Same name again: refused, not replaced.
    const again = await handlers['chapter:export'](id, 'md')
    assert.equal(again.ok, false)
    assert.match(again.error, /already exists/)

    const cancelled = createHandlers(() => ({ db, libraryRoot: root }), null, null, { chooseFile: async () => null })
    assert.deepEqual(await cancelled['chapter:export'](id, 'md'), { ok: true, data: null })
    assert.deepEqual(await handlers['chapter:export'](999999, 'md'), { ok: true, data: null })
    assert.equal((await createHandlers(() => ({ db, libraryRoot: root }))['chapter:export'](id, 'md')).ok, false)
  } finally {
    db.close()
  }
})
