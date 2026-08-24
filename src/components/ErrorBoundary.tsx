import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-[200px] items-center justify-center p-8">
            <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950/30">
              <div className="mb-2 text-lg font-semibold text-red-700 dark:text-red-400">页面渲染异常</div>
              <div className="mb-4 text-sm text-red-600 dark:text-red-300">
                {this.state.error?.message ?? '未知错误'}
              </div>
              <button
                onClick={() => window.location.reload()}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                重新加载
              </button>
            </div>
          </div>
        )
      )
    }
    return this.props.children
  }
}
