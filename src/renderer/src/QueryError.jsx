export function QueryError({ what, error }) {
  return (
    <div className="query-error" role="alert">
      <strong>Couldn't load {what}.</strong>
      <pre>{error}</pre>
    </div>
  )
}
