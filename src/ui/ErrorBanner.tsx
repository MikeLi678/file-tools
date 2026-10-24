import { ERROR_MESSAGES } from '../loadFiles'
import type { LoadError } from '../types'

type Props = {
  errors: LoadError[]
  onDismiss: () => void
}

export function ErrorBanner({ errors, onDismiss }: Props) {
  if (errors.length === 0) return null
  return (
    <div className="error-banner" role="alert">
      <ul>
        {errors.map((error, i) => (
          <li key={`${error.fileName}-${i}`}>
            <strong>{error.fileName}</strong>：{ERROR_MESSAGES[error.reason]}
          </li>
        ))}
      </ul>
      <button className="text-button" onClick={onDismiss}>
        知道了
      </button>
    </div>
  )
}
