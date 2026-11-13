import fs from 'node:fs'
import path from 'node:path'
import { countProse } from './prose.js'

// Hardcoded for the spike: the one test scene, as path segments under the
// library root.
const TEST_SCENE = ['test-fic', 'chapter-1', 'scene-1.md']

// Read-only. Counts are computed from the file on every call, never stored.
export function readTestScene(libraryRoot) {
  const file = path.join(libraryRoot, ...TEST_SCENE)
  const text = fs.readFileSync(file, 'utf8')
  return { path: file, ...countProse(text) }
}
