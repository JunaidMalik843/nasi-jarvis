import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean; error: string }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: '' };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, error: err.message + '\n' + (err.stack || '') };
  }

  componentDidCatch(err: Error) {
    console.error('[NASI ErrorBoundary]', err);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ background: '#0a0e14', color: '#e9675f', padding: 24, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', overflow: 'auto', height: '100vh' }}>
          <h2 style={{ color: '#e9675f', margin: '0 0 12px' }}>⚠ NASI Runtime Error</h2>
          <div>{this.state.error}</div>
        </div>
      );
    }
    return ((this as any).props as Props).children;
  }
}
