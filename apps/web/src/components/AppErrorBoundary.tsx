import React from 'react';

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string | null;
};

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: null,
  };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    const message = error instanceof Error ? error.message : null;
    return {
      hasError: true,
      message,
    };
  }

  componentDidCatch(error: unknown) {
    console.error('[AppErrorBoundary] render failure', error);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="page page--commerce">
        <section className="panel stack-16" style={{ maxWidth: 820, margin: '40px auto' }}>
          <p className="eyebrow">Runtime Error</p>
          <h1>页面发生错误</h1>
          <p className="muted">
            这不是你的操作问题。我们已经拦截了异常，刷新后通常可以恢复。
          </p>
          {this.state.message ? (
            <div className="error-card compact">{this.state.message}</div>
          ) : null}
          <button className="button primary" type="button" onClick={this.handleReload}>
            刷新页面
          </button>
        </section>
      </main>
    );
  }
}
