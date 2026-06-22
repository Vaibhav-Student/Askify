import React from 'react';
import { AlertCircle, RefreshCw } from './Icons';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onRetry) this.props.onRetry();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleRetry);
      }

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
          background: 'var(--bg)',
          color: 'var(--text-1)',
          fontFamily: 'var(--font)',
          textAlign: 'center',
        }}>
          <AlertCircle size={64} style={{ color: 'var(--error)', marginBottom: '1.5rem' }} />
          <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>Something went wrong</h2>
          <p style={{ 
            color: 'var(--text-2)', 
            maxWidth: '500px', 
            marginBottom: '2rem',
            lineHeight: 1.6
          }}>
            {this.state.error?.message || 'An unexpected error occurred. The development team has been notified.'}
          </p>
          {import.meta.env.DEV && this.state.errorInfo && (
            <details style={{ textAlign: 'left', maxWidth: '600px', margin: '0 auto 2rem' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--text-3)' }}>Error Details</summary>
              <pre style={{
                background: 'var(--bg-surface)',
                padding: '1rem',
                borderRadius: '8px',
                overflow: 'auto',
                fontSize: '0.75rem',
                marginTop: '0.5rem',
                color: 'var(--text-2)'
              }}>
                {this.state.error?.stack || this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
          <button
            onClick={this.handleRetry}
            style={{
              padding: '0.875rem 2rem',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <RefreshCw size={18} />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;