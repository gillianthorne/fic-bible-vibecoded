import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkLink } from '../src/main/links.js'
import { splitLinks } from '../src/renderer/src/links.js'
import { createHandlers } from '../src/main/handlers.js'

test('checkLink passes http and https links through', () => {
  assert.equal(checkLink('https://archiveofourown.org/works/1'), 'https://archiveofourown.org/works/1')
  assert.equal(checkLink('  http://imgur.com/a/xyz  '), 'http://imgur.com/a/xyz')
})

test('checkLink refuses other protocols, blanks and non-links', () => {
  for (const bad of ['file:///C:/Windows/system32/calc.exe', 'javascript:alert(1)', 'ms-settings:', 'mailto:a@b.c']) {
    assert.throws(() => checkLink(bad), /Only http and https/, bad)
  }
  assert.throws(() => checkLink(''), /No link given/)
  assert.throws(() => checkLink(null), /No link given/)
  assert.throws(() => checkLink('imgur.com/a/xyz'), /Not a link/)
})

test('link:open hands a checked link to the opener, and refuses others without calling it', async () => {
  const opened = []
  const handlers = createHandlers(() => ({}), null, { openExternal: async (url) => opened.push(url) })
  assert.deepEqual(await handlers['link:open']('https://imgur.com/a/xyz'), { ok: true, data: null })
  const refused = await handlers['link:open']('file:///etc/passwd')
  assert.equal(refused.ok, false)
  assert.match(refused.error, /Only http and https/)
  assert.deepEqual(opened, ['https://imgur.com/a/xyz'])
})

test('link:open is an error when no opener is wired up', async () => {
  const result = await createHandlers(() => ({}))['link:open']('https://imgur.com')
  assert.equal(result.ok, false)
})

test('splitLinks finds URLs in notes and keeps the rest as text', () => {
  assert.deepEqual(splitLinks('Pictures: https://imgur.com/a/xyz. CSS in html/skin.css'), [
    { type: 'text', text: 'Pictures: ' },
    { type: 'link', text: 'https://imgur.com/a/xyz' },
    { type: 'text', text: '. CSS in html/skin.css' }
  ])
  assert.deepEqual(splitLinks('(see https://a.example/x)'), [
    { type: 'text', text: '(see ' },
    { type: 'link', text: 'https://a.example/x' },
    { type: 'text', text: ')' }
  ])
  assert.deepEqual(splitLinks('no links\nhere'), [{ type: 'text', text: 'no links\nhere' }])
  assert.deepEqual(splitLinks(''), [])
})
