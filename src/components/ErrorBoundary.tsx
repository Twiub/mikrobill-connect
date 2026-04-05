/**
 * frontend/src/components/ErrorBoundary.tsx
 *
 * LO-04 FIX: React error boundary components.
 *
 * Without error boundaries, a single unhandled JavaScript exception in
 * AdminLayout or any child panel crashes the entire admin UI with a blank
 * white screen. Error boundaries catch errors in their component subtree
 * and render a fallback UI instead of unmounting the whole tree.
 *
 * Usage:
 *   <AdminErrorBoundary>
 *     <SomePage />
 *   </AdminErrorBoundary>
 *
 *   <PanelErrorBoundary title="Payment Flow">
 *     <PaymentPanel />
 *   </PanelErrorBoundary>
 */

import { Component, ReactNode, ErrorInfo } from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  title?: string;
  onError?: (error: Error, info: ErrorInfo) => void;
}

// ─── Base ErrorBoundary class ─────────────────────────────────────────────────
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
    // Log to console — operators can wire this to Sentry/similar if needed
    console.error("[ErrorBoundary] Uncaught error in component tree:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <DefaultErrorFallback
          title={this.props.title}
          error={this.state.error}
          onReset={this.handleReset}
        />
      );
    }
    return this.props.children;
  }
}

// ─── Default fallback UI ──────────────────────────────────────────────────────
function DefaultErrorFallback({
  title,
  error,
  onReset,
}: {
  title?: string;
  error: Error | null;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[200px] p-6 bg-red-50 border border-red-200 rounded-lg m-4">
      <div className="text-red-600 text-4xl mb-3">⚠️</div>
      <h2 className="text-lg font-semibold text-red-800 mb-1">
        {title ? `${title} — Something went wrong` : "Something went wrong"}
      </h2>
      <p className="text-sm text-red-600 mb-4 text-center max-w-md">
        {error?.message || "An unexpected error occurred in this panel."}
      </p>
      <button
        onClick={onReset}
        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium"
      >
        Try again
      </button>
    </div>
  );
}

// ─── Full-page error boundary for AdminLayout ─────────────────────────────────
export function AdminErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      title="Admin Panel"
      fallback={
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-8">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin UI Error</h1>
          <p className="text-gray-600 mb-6 text-center max-w-lg">
            An unexpected error has crashed the admin interface. Check the browser console for
            details. You can try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Reload Page
          </button>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

// ─── Panel-level error boundary for dashboard widgets ─────────────────────────
export function PanelErrorBoundary({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <ErrorBoundary title={title}>
      {children}
    </ErrorBoundary>
  );
}

export default ErrorBoundary;
