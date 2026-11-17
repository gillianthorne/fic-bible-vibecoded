import { useState } from 'react'
import { useQuery } from './useQuery.js'
import { QueryError } from './QueryError.jsx'
import CharacterNotes from './CharacterNotes.jsx'
import { DeleteButton, EditButton, Field, FormActions, SaveError, SuggestInput, useSave, useSuggestions } from './editing.jsx'

// One character's profile (spec: Character profile): name, age and
// birthday, then the author's own label-and-value fields in order, then
// their notes. Field edits are database rows and are saved straight away;
// onChanged() then makes the screen read the character again.

function DetailsForm({ character, onDone, onCancel }) {
  const [name, setName] = useState(character.name)
  const [age, setAge] = useState(character.age)
  const [birthday, setBirthday] = useState(character.birthday)
  const { busy, error, save } = useSave()

  function submit(e) {
    e.preventDefault()
    save(() => window.ficBible.updateCharacter(character.id, { name, age, birthday }), onDone)
  }

  return (
    <form className="edit-form" onSubmit={submit}>
      <Field label="Name" wide>
        {(id) => <input id={id} type="text" value={name} required autoFocus onChange={(e) => setName(e.target.value)} />}
      </Field>
      <div className="edit-row">
        <Field label="Age in the fic">
          {(id) => <input id={id} type="text" value={age} onChange={(e) => setAge(e.target.value)} />}
        </Field>
        <Field label="Birthday">
          {(id) => <input id={id} type="text" value={birthday} onChange={(e) => setBirthday(e.target.value)} />}
        </Field>
      </div>
      <p className="muted edit-note">Notes file: {character.filename} (the app doesn’t rename files)</p>
      <SaveError error={error} />
      <FormActions busy={busy} onCancel={onCancel} />
    </form>
  )
}

function Details({ character, onChanged, onDeleted }) {
  const [mode, setMode] = useState('view') // 'view' | 'edit' | 'confirm-delete'
  const { busy, error, save } = useSave()

  if (mode === 'edit') {
    return (
      <DetailsForm
        character={character}
        onCancel={() => setMode('view')}
        onDone={() => {
          setMode('view')
          onChanged()
        }}
      />
    )
  }
  const blank = <span className="muted">—</span>
  return (
    <>
      <div className="title-row">
        <h1>{character.name}</h1>
        <EditButton label="Edit name, age and birthday" onClick={() => setMode('edit')} />
        <DeleteButton label="Delete character" onClick={() => setMode('confirm-delete')} />
      </div>
      {mode === 'confirm-delete' && (
        <div className="beat-confirm" role="alert">
          <span>
            Delete {character.name} and their fields? Their notes file, {character.filename}, stays on disk.
          </span>
          <button
            type="button"
            className="button-danger"
            disabled={busy}
            onClick={() => save(() => window.ficBible.deleteCharacter(character.id), onDeleted)}
          >
            Delete
          </button>
          <button type="button" disabled={busy} onClick={() => setMode('view')}>
            Cancel
          </button>
        </div>
      )}
      <SaveError error={error} />
      <dl className="scene-fields">
        <div>
          <dt>Age in the fic</dt>
          <dd>{character.age || blank}</dd>
        </div>
        <div>
          <dt>Birthday</dt>
          <dd>{character.birthday || blank}</dd>
        </div>
      </dl>
    </>
  )
}

// Used for both a new field and editing one.
function FieldForm({ initial, labels, busy, error, onSubmit, onCancel, saveLabel }) {
  const [label, setLabel] = useState(initial.label)
  const [value, setValue] = useState(initial.value)

  function submit(e) {
    e.preventDefault()
    onSubmit({ label, value })
  }

  return (
    <form className="edit-form" onSubmit={submit}>
      <Field label="Label">{(id) => <SuggestInput id={id} value={label} onChange={setLabel} options={labels} required />}</Field>
      <Field label="Value" wide>
        {(id) => <textarea id={id} rows={2} value={value} onChange={(e) => setValue(e.target.value)} />}
      </Field>
      <SaveError error={error} />
      <FormActions busy={busy} onCancel={onCancel} saveLabel={saveLabel} />
    </form>
  )
}

function CharacterField({ field, index, count, labels, onChanged }) {
  const [mode, setMode] = useState('view') // 'view' | 'edit' | 'confirm-delete'
  const { busy, error, save, clearError } = useSave()
  const done = () => {
    setMode('view')
    onChanged()
  }

  if (mode === 'edit') {
    return (
      <li className="beat beat-editing">
        <div className="beat-body">
          <FieldForm
            initial={field}
            labels={labels}
            busy={busy}
            error={error}
            onSubmit={(fields) => save(() => window.ficBible.updateCharacterField(field.id, fields), done)}
            onCancel={() => {
              clearError()
              setMode('view')
            }}
          />
        </div>
      </li>
    )
  }

  return (
    <li className="beat character-field">
      <div className="beat-body">
        <span className="character-field-label">{field.label}</span>
        <p className="character-field-value">{field.value || <span className="muted">—</span>}</p>
        {mode === 'confirm-delete' && (
          <div className="beat-confirm" role="alert">
            <span>Delete “{field.label}”? This can’t be undone.</span>
            <button
              type="button"
              className="button-danger"
              disabled={busy}
              onClick={() => save(() => window.ficBible.deleteCharacterField(field.id), done)}
            >
              Delete
            </button>
            <button type="button" disabled={busy} onClick={() => setMode('view')}>
              Cancel
            </button>
          </div>
        )}
        <SaveError error={error} />
      </div>
      {mode === 'view' && (
        <div className="beat-tools">
          <button
            type="button"
            aria-label={`Move ${field.label} up`}
            title="Move up"
            disabled={busy || index === 0}
            onClick={() => save(() => window.ficBible.moveCharacterField(field.id, 'up'), onChanged)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Move ${field.label} down`}
            title="Move down"
            disabled={busy || index === count - 1}
            onClick={() => save(() => window.ficBible.moveCharacterField(field.id, 'down'), onChanged)}
          >
            ↓
          </button>
          <button type="button" aria-label={`Edit ${field.label}`} disabled={busy} onClick={() => setMode('edit')}>
            Edit
          </button>
          <button type="button" aria-label={`Delete ${field.label}`} disabled={busy} onClick={() => setMode('confirm-delete')}>
            Delete
          </button>
        </div>
      )}
    </li>
  )
}

function AddField({ characterId, labels, onChanged }) {
  const [open, setOpen] = useState(false)
  const { busy, error, save, clearError } = useSave()

  if (!open) {
    return (
      <button type="button" className="add-beat" onClick={() => setOpen(true)}>
        + Add field
      </button>
    )
  }
  return (
    <div className="beat beat-editing">
      <div className="beat-body">
        <FieldForm
          initial={{ label: '', value: '' }}
          labels={labels}
          busy={busy}
          error={error}
          saveLabel="Add field"
          onSubmit={(fields) =>
            save(
              () => window.ficBible.createCharacterField(characterId, fields),
              () => {
                setOpen(false)
                onChanged()
              }
            )
          }
          onCancel={() => {
            clearError()
            setOpen(false)
          }}
        />
      </div>
    </div>
  )
}

// refreshKey re-reads the character without blanking it. onDeleted runs
// after the character is deleted, so App can move off this screen.
export default function CharacterProfile({ characterId, refreshKey, onChanged, onDeleted, onDirtyChange }) {
  const result = useQuery(() => window.ficBible.characterProfile(characterId), characterId, refreshKey)
  const { fieldLabels = [] } = useSuggestions(refreshKey)

  if (result.loading) return <p className="muted">Loading…</p>
  if (result.ok === false) return <QueryError what="this character" error={result.error} />
  if (result.data === null) return <p className="muted">Character not found.</p>

  const character = result.data
  return (
    <article className="scene-detail character-profile">
      <header>
        <p className="muted">{character.work.title} · Character</p>
        <Details key={character.id} character={character} onChanged={onChanged} onDeleted={() => onDeleted(character)} />
      </header>

      <section aria-label="Fields">
        <h2>Fields</h2>
        {character.fields.length === 0 && (
          <p className="muted">No fields yet. Add anything worth tracking: team, position, a coffee order.</p>
        )}
        {character.fields.length > 0 && (
          <ol className="beats character-fields">
            {character.fields.map((field, index) => (
              <CharacterField
                key={field.id}
                field={field}
                index={index}
                count={character.fields.length}
                labels={fieldLabels}
                onChanged={onChanged}
              />
            ))}
          </ol>
        )}
        <AddField characterId={character.id} labels={fieldLabels} onChanged={onChanged} />
      </section>

      <CharacterNotes
        key={`notes-${character.id}`}
        characterId={character.id}
        characterName={character.name}
        onDirtyChange={onDirtyChange}
      />

    </article>
  )
}
