import type { ReactNode } from 'react';

interface OperatorV3ShellProps {
  rail: ReactNode;
  stage: ReactNode;
  drawer: ReactNode;
}

export function OperatorV3Shell({ rail, stage, drawer }: OperatorV3ShellProps) {
  return (
    <div className="operator-v3-page">
      <section className="operator-v3-shell">
        <aside className="operator-v3-shell__rail">
          {rail}
        </aside>

        <main className="operator-v3-shell__stage">
          {stage}
        </main>

        <aside className="operator-v3-shell__drawer">
          {drawer}
        </aside>
      </section>
    </div>
  );
}
