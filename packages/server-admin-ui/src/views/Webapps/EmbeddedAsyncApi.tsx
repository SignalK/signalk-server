import { useEffect, useState } from 'react'

interface AsyncApiSpec {
  title: string
  url: string
}

interface AsyncApiDoc {
  asyncapi: string
  info: {
    title: string
    version: string
    description?: string
    descriptionHtml?: string
  }
  servers?: Record<
    string,
    { host: string; protocol: string; pathname?: string; description?: string }
  >
  channels?: Record<
    string,
    {
      address?: string
      description?: string
      messages?: Record<
        string,
        {
          name?: string
          title?: string
          summary?: string
          payload?: Record<string, unknown>
        }
      >
    }
  >
  operations?: Record<
    string,
    { action: string; summary?: string; description?: string }
  >
}

function schemaToString(schema: Record<string, unknown>, indent = 0): string {
  if (!schema) return 'any'
  const pad = '  '.repeat(indent)
  if (schema.anyOf)
    return (schema.anyOf as Record<string, unknown>[])
      .map((s) => schemaToString(s, indent))
      .join(' | ')
  if (schema.const !== undefined) return JSON.stringify(schema.const)
  if (
    schema.type === 'object' &&
    schema.properties &&
    typeof schema.properties === 'object'
  ) {
    const props = schema.properties as Record<string, Record<string, unknown>>
    const lines = ['{']
    for (const k of Object.keys(props)) {
      lines.push(`${pad}  ${k}: ${schemaToString(props[k], indent + 1)}`)
    }
    lines.push(`${pad}}`)
    return lines.join('\n')
  }
  if (schema.type === 'array' && schema.items)
    return (
      schemaToString(schema.items as Record<string, unknown>, indent) + '[]'
    )
  if (schema.type) return schema.type as string
  return 'any'
}

export default function EmbeddedAsyncApi() {
  const [specs, setSpecs] = useState<AsyncApiSpec[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [doc, setDoc] = useState<AsyncApiDoc | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/skServer/asyncapi')
      .then((r) => r.json())
      .then((list) => {
        const s = list.map((item: { title: string; jsonUrl: string }) => ({
          title: item.title,
          url: item.jsonUrl
        }))
        setSpecs(s)
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    if (specs.length === 0) return
    setDoc(null)
    fetch(specs[selectedIdx].url)
      .then((r) => r.json())
      .then(setDoc)
      .catch((e) => setError(e.message))
  }, [specs, selectedIdx])

  if (error) return <p style={{ color: 'red', padding: 20 }}>Error: {error}</p>

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <label htmlFor="api-select" style={{ marginRight: 8, fontWeight: 500 }}>
          API:
        </label>
        <select
          id="api-select"
          value={selectedIdx}
          onChange={(e) => setSelectedIdx(Number(e.target.value))}
          style={{ padding: '4px 8px' }}
        >
          {specs.map((s, i) => (
            <option key={s.url} value={i}>
              {s.title}
            </option>
          ))}
        </select>
      </div>

      {!doc ? (
        <p>Loading...</p>
      ) : (
        <>
          <h4>{doc.info.title}</h4>
          <small className="text-muted">
            v{doc.info.version} — AsyncAPI {doc.asyncapi}
          </small>
          {doc.info.descriptionHtml && (
            <div
              style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{ __html: doc.info.descriptionHtml }}
            />
          )}

          {doc.servers && (
            <>
              <h5 style={{ marginTop: 24 }}>Servers</h5>
              {Object.entries(doc.servers).map(([name, srv]) => (
                <div
                  key={name}
                  className="card"
                  style={{ marginBottom: 8, padding: 12 }}
                >
                  <strong>{name}</strong>{' '}
                  <span className="badge bg-primary">{srv.protocol}</span>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    Host: {srv.host}
                    {srv.pathname && <> — Path: {srv.pathname}</>}
                  </div>
                  {srv.description && (
                    <div className="text-muted" style={{ fontSize: 13 }}>
                      {srv.description}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {doc.channels && (
            <>
              <h5 style={{ marginTop: 24 }}>Channels</h5>
              {Object.entries(doc.channels).map(([cname, ch]) => (
                <div
                  key={cname}
                  className="card"
                  style={{ marginBottom: 12, padding: 12 }}
                >
                  <code style={{ fontSize: 14 }}>{ch.address || cname}</code>
                  {ch.description && (
                    <div
                      className="text-muted"
                      style={{ fontSize: 13, marginTop: 4 }}
                    >
                      {ch.description}
                    </div>
                  )}
                  {ch.messages && (
                    <>
                      <h6 style={{ marginTop: 12 }}>Messages</h6>
                      {Object.entries(ch.messages).map(([mname, msg]) => (
                        <div
                          key={mname}
                          style={{
                            marginBottom: 10,
                            paddingLeft: 12,
                            borderLeft: '2px solid #dee2e6'
                          }}
                        >
                          <code style={{ fontSize: 13 }}>
                            {msg.name || mname}
                          </code>
                          {msg.title && (
                            <span style={{ marginLeft: 8, fontWeight: 500 }}>
                              {msg.title}
                            </span>
                          )}
                          {msg.summary && (
                            <div
                              className="text-muted"
                              style={{ fontSize: 12 }}
                            >
                              {msg.summary}
                            </div>
                          )}
                          {msg.payload && (
                            <pre
                              style={{
                                background: '#f5f5f5',
                                padding: 8,
                                borderRadius: 4,
                                fontSize: 12,
                                marginTop: 4
                              }}
                            >
                              {schemaToString(
                                msg.payload as Record<string, unknown>
                              )}
                            </pre>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ))}
            </>
          )}

          {doc.operations && (
            <>
              <h5 style={{ marginTop: 24 }}>Operations</h5>
              {Object.entries(doc.operations).map(([oname, op]) => (
                <div
                  key={oname}
                  className="card"
                  style={{ marginBottom: 8, padding: 12 }}
                >
                  <span className="badge bg-success" style={{ marginRight: 8 }}>
                    {op.action}
                  </span>
                  <strong>{oname}</strong>
                  {op.summary && (
                    <div
                      className="text-muted"
                      style={{ fontSize: 13, marginTop: 4 }}
                    >
                      {op.summary}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}
