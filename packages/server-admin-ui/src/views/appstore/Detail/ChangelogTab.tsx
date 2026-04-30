import React from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ChangelogTabProps {
  changelog: string
  changelogFormat: 'markdown' | 'synthesized'
  version: string
}

// Matches conventional-commit prefixes that GitHub release bodies and
// CHANGELOG.md entries routinely start a list item with.
// Captures: [1] prefix label, [2] optional (scope), [3] separator + rest.
const PREFIX_RE = /^(feat|fix|BREAKING|!)(\([^)]*\))?(\s*[:!] .*)$/i

function toneClass(label: string): string {
  const lower = label.toLowerCase()
  if (lower === 'feat') return 'plugin-detail__changelog-feat'
  if (lower === 'fix') return 'plugin-detail__changelog-fix'
  return 'plugin-detail__changelog-breaking'
}

const markdownComponents: Components = {
  // Highlights conventional-commit-style prefixes on list items so that
  // lines starting with "feat:", "fix:", or "BREAKING:" get coloured
  // inline. Runs through React rendering so we never need to inject raw
  // HTML into the markdown pipeline.
  li({ children, ...rest }) {
    const arr = React.Children.toArray(children)
    const first = arr[0]
    if (typeof first === 'string') {
      const m = PREFIX_RE.exec(first)
      if (m) {
        const [, label, scope, tail] = m
        const className = toneClass(label)
        const tailChildren = arr.slice(1)
        return (
          <li {...rest}>
            <span className={className}>{label}</span>
            {scope}
            {tail}
            {tailChildren}
          </li>
        )
      }
    }
    return <li {...rest}>{children}</li>
  }
}

const ChangelogTab: React.FC<ChangelogTabProps> = ({
  changelog,
  changelogFormat,
  version
}) => {
  if (!changelog || changelog.trim().length === 0) {
    return (
      <div className="text-muted">
        <p className="mb-1">No changelog available.</p>
        <p className="small mb-0">
          Current version: <strong>v{version}</strong>
        </p>
      </div>
    )
  }

  if (changelogFormat === 'synthesized') {
    return (
      <div>
        <div className="text-muted small mb-3">
          The plugin doesn&apos;t ship a CHANGELOG.md, so only version numbers
          are available.
        </div>
        <pre>{changelog}</pre>
      </div>
    )
  }

  return (
    <div className="plugin-detail__markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {changelog}
      </ReactMarkdown>
    </div>
  )
}

export default ChangelogTab
