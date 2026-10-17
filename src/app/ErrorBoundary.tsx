import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Captura errores de renderizado para que un fallo en un editor no tumbe toda la aplicación. */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode | ((e: Error, reset: () => void) => ReactNode) }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Error de renderizado', error);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      const fb = this.props.fallback;
      if (typeof fb === 'function') return fb(error, this.reset);
      if (fb) return fb;
      return (
        <div className="center-fill" role="alert">
          <h2>Algo ha fallado</h2>
          <p className="muted">{error.message}</p>
          <button type="button" className="btn" onClick={this.reset}>
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
