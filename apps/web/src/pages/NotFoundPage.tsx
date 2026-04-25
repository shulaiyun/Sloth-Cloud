import React from 'react';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="operator-v4-panel">
      <h1>页面不存在</h1>
      <p>你访问的页面不存在或已被移动。</p>
      <Link className="button primary" to="/operator-lab">返回 AI 工作台</Link>
    </section>
  );
}
