import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const rawMsg = error instanceof Error ? error.message : String(error || 'Unexpected error');
    let friendly = rawMsg;
    try {
      const parsed = JSON.parse(rawMsg) as {
        error?: string;
        operationType?: string;
        path?: string | null;
      };
      if (parsed && parsed.error) {
        friendly = `Firestore ${parsed.operationType || 'operation'} failed${
          parsed.path ? ` on ${parsed.path}` : ''
        }: ${parsed.error}`;
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, errorMessage: friendly };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-white dark:bg-neutral-950 text-neutral-950 dark:text-neutral-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full border border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 rounded-lg p-6">
            <div className="flex items-center gap-2.5 text-red-700 dark:text-red-300">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h1 className="text-base font-semibold">Application Error</h1>
            </div>
            <p className="mt-2 text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed break-words">
              {this.state.errorMessage}
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="primary"
                size="sm"
                icon={<RefreshCw className="h-3.5 w-3.5" />}
                onClick={() => {
                  this.setState({ hasError: false, errorMessage: '' });
                  if (typeof window !== 'undefined') {
                    window.location.reload();
                  }
                }}
              >
                Reload Workspace
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
