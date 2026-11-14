import { parseParagraph } from './markdown.js'

// Renders one counted paragraph's text as React elements, from the plain
// data parseParagraph returns. Text goes in as text nodes only, so a file
// can never inject markup.

function Inlines({ nodes }) {
  return nodes.map((n, i) => {
    if (n.type === 'text') return n.text
    if (n.type === 'code') return <code key={i}>{n.text}</code>
    const Tag = n.type === 'strong' ? 'strong' : 'em'
    return (
      <Tag key={i}>
        <Inlines nodes={n.children} />
      </Tag>
    )
  })
}

function Lines({ lines }) {
  return lines.map((line, i) => (
    <span key={i}>
      {i > 0 && <br />}
      <Inlines nodes={line} />
    </span>
  ))
}

function Block({ block }) {
  switch (block.type) {
    case 'break':
      return <hr className="prose-break" />
    case 'heading': {
      const Tag = `h${Math.min(block.level + 1, 6)}`
      return (
        <Tag className="prose-heading">
          <Inlines nodes={block.inlines} />
        </Tag>
      )
    }
    case 'quote':
      return (
        <blockquote>
          <Lines lines={block.lines} />
        </blockquote>
      )
    case 'list':
      return (
        <ul className="prose-list">
          {block.items.map((item, i) => (
            <li key={i}>
              <span className="prose-list-marker">{item.marker}</span> <Inlines nodes={item.inlines} />
            </li>
          ))}
        </ul>
      )
    default:
      return (
        <p>
          <Lines lines={block.lines} />
        </p>
      )
  }
}

export default function Markdown({ paragraph }) {
  return parseParagraph(paragraph).map((block, i) => <Block key={i} block={block} />)
}
