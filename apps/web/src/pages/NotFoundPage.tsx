import { Link } from 'react-router-dom';

import { useSite } from '../lib/site-context';

export function NotFoundPage() {
  const { locale } = useSite();

  return (
    <section className="panel stack-16" style={{ maxWidth: 880, margin: '20px auto' }}>
      <p className="eyebrow">404</p>
      <h1>{locale.startsWith('zh') ? '页面不存在' : 'Page not found'}</h1>
      <p className="muted">
        {locale.startsWith('zh')
          ? '你访问的路径没有对应页面，可能是旧链接或地址拼写有误。'
          : 'The route you opened does not exist. It might be an old link or a typo.'}
      </p>
      <div className="action-row">
        <Link className="button primary" to="/">
          {locale.startsWith('zh') ? '返回首页' : 'Go home'}
        </Link>
        <Link className="button ghost" to="/catalog">
          {locale.startsWith('zh') ? '进入商店' : 'Open catalog'}
        </Link>
      </div>
    </section>
  );
}
