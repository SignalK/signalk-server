import React from 'react'

// eslint-disable-next-line react/display-name
const LoadingError = ({ message }) => (
  <div style={{ padding: '2rem', textAlign: 'center' }}>
    <h4 style={{ color: '#d9534f' }}>Error loading component</h4>
    {message && (
      <p style={{ color: '#666', fontSize: '0.9rem', marginTop: '1rem' }}>
        {message}
      </p>
    )}
  </div>
)

export default LoadingError
