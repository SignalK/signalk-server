interface LoadingErrorProps {
  message?: string
}

export default function LoadingError({ message }: LoadingErrorProps) {
  return (
    <div className="p-4 text-center">
      <h4 className="text-danger">Error loading component</h4>
      {message && <p className="text-secondary small mt-3">{message}</p>}
    </div>
  )
}
