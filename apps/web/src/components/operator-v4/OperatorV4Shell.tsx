import React, { type ReactNode } from 'react';

interface OperatorV4ShellProps {
  rail: ReactNode;
  stage: ReactNode;
  drawer: ReactNode;
  railCollapsed?: boolean;
}

export function OperatorV4Shell({ rail, stage, drawer, railCollapsed = false }: OperatorV4ShellProps) {
  return (
    <div className="operator-v4-page">
      <section className={`operator-v4-shell ${railCollapsed ? 'is-rail-collapsed' : ''}`}>
        <aside className="operator-v4-shell__rail">
          {rail}
        </aside>
        <main className="operator-v4-shell__stage">
          {stage}
        </main>
      </section>
      {drawer ? (
        <aside className="operator-v4-shell__drawer-layer">
          {drawer}
        </aside>
      ) : null}
    </div>
  );
}
