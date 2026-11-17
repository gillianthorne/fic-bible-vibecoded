import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'
import MarkdownFileEditor from './MarkdownFileEditor.jsx'

// A character's freeform notes, on their profile (spec: Character
// profile). They live in the character's markdown file, and are edited
// with the scene editor's markdown editing and toolbar, without its
// paragraph numbers, wordcount or edit notes. Saving is explicit and
// guarded as a scene save is: the main process refuses if the file
// changed on disk since it was opened.
//
// onDirtyChange(dirty) tells App whether there are unsaved notes, so
// leaving the profile can ask first.

export default function CharacterNotes({ characterId, characterName, onDirtyChange }) {
  const result = useQuery(() => window.ficBible.characterNotes(characterId), characterId)

  let body
  if (result.loading) body = <p className="muted">Loading…</p>
  else if (result.ok === false) body = <QueryError what="the notes" error={result.error} />
  else if (result.data === null) body = <p className="muted">Character not found.</p>
  else if (result.data.fileError !== null) {
    const what = result.data.fileError === 'ENOENT' ? 'The notes file is missing' : "The notes file can't be edited"
    body = (
      <p className="file-error" title={result.data.path}>
        {what} ({result.data.fileError}).
      </p>
    )
  } else
    body = (
      <MarkdownFileEditor
        key={characterId}
        file={result.data}
        save={(text, hash) => window.ficBible.saveCharacterNotes(characterId, text, hash)}
        label={`Notes on ${characterName}`}
        onDirtyChange={onDirtyChange}
      />
    )

  return (
    <section aria-label="Notes" className="character-notes">
      <h2>Notes</h2>
      {body}
    </section>
  )
}
