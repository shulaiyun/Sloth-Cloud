import { BrandLogo } from '../components/BrandLogo';
import { CountryFlagIcon } from '../components/FlagIcon';
import { VisualIcon } from '../components/VisualIcon';
import { brand } from '../lib/brand';

const previewNodes = [
  {
    code: 'JP',
    title: '日本东京',
    latency: '38ms',
    plans: ['东京 BGP 1C1G', '东京 BGP 2C2G'],
    price: '¥39.00',
  },
  {
    code: 'HK',
    title: '香港',
    latency: '24ms',
    plans: ['香港 BGP 1C1G', '香港 BGP 2C2G'],
    price: '¥45.00',
  },
  {
    code: 'US',
    title: '美国洛杉矶',
    latency: '126ms',
    plans: ['洛杉矶 BGP 1C1G', '洛杉矶 BGP 2C2G'],
    price: '¥39.00',
  },
];

const operatingSystems = [
  { label: 'Ubuntu 22.04', family: 'Ubuntu', glyph: 'UB', tone: 'amber' as const },
  { label: 'Debian 12', family: 'Debian', glyph: 'DE', tone: 'violet' as const },
  { label: 'RockyLinux 9', family: 'RockyLinux', glyph: 'RL', tone: 'emerald' as const },
];

const apps = [
  { label: '1Panel', body: '轻量运维面板，适合网站、容器和数据库。', glyph: '1P', tone: 'emerald' as const },
  { label: 'Portainer', body: '面向 Docker 主机的可视化容器管理。', glyph: 'PT', tone: 'blue' as const },
  { label: 'Uptime Kuma', body: '快速监控站点、服务和端口可用性。', glyph: 'UK', tone: 'teal' as const },
];

const flowSteps = [
  '选择节点与规格',
  '选择系统与应用',
  '确认账单',
  '自动开通服务',
];

export function CustomerPreviewPage() {
  return (
    <div className="customer-preview">
      <section className="customer-preview__hero">
        <div className="customer-preview__copy">
          <span className="eyebrow">Public customer preview</span>
          <h1>树懒云客户前台预览</h1>
          <p>
            这是开源仓库里的安全静态预览：展示真实客户前台的信息架构、购买路径和 AI 工作台入口，
            但不连接生产接口、不包含客户数据，也不暴露支付、面板或模型密钥。
          </p>
          <div className="action-row">
            <a className="button primary" href="#plans">查看套餐预览</a>
            <a className="button secondary" href="#ai-workbench">查看 AI 工作台入口</a>
          </div>
        </div>

        <aside className="customer-preview__brand-card">
          <BrandLogo variant="hero" />
          <div>
            <span>{brand.nameEnCompact}</span>
            <strong>{brand.nameCn}</strong>
            <small>VPS 与托管应用云</small>
          </div>
        </aside>
      </section>

      <section className="customer-preview__section" id="plans">
        <div className="section-heading section-heading--compact">
          <div>
            <p className="eyebrow">VPS marketplace</p>
            <h2>客户先按国家节点挑，再进入具体套餐</h2>
          </div>
          <span className="customer-preview__badge">静态预览数据</span>
        </div>

        <div className="customer-preview__node-grid">
          {previewNodes.map((node) => (
            <article className="customer-preview__node-card" key={node.code}>
              <div className="choice-card__headline">
                <CountryFlagIcon countryCode={node.code} />
                <div className="stack-8">
                  <strong>{node.title}</strong>
                  <span>{node.latency} 参考延迟</span>
                </div>
              </div>
              <div className="stack-8">
                {node.plans.map((plan) => (
                  <p className="muted node-market-card__plan" key={plan}>{plan}</p>
                ))}
              </div>
              <div className="customer-preview__price-row">
                <strong>{node.price}</strong>
                <span>/ 月起</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="customer-preview__section customer-preview__split">
        <div className="customer-preview__panel">
          <p className="eyebrow">Product detail</p>
          <h2>套餐详情与配置选择</h2>
          <p className="muted">
            客户进入具体套餐后，可以选择系统、主应用、附加组件和主机名。真实部署时这些选项由 BFF
            适配 Paymenter 与 VPS 面板返回。
          </p>
          <div className="customer-preview__mini-grid">
            {operatingSystems.map((os) => (
              <article className="customer-preview__mini-card" key={os.label}>
                <VisualIcon glyph={os.glyph} label={os.family} tone={os.tone} />
                <strong>{os.label}</strong>
              </article>
            ))}
          </div>
        </div>

        <div className="customer-preview__panel">
          <p className="eyebrow">Managed apps</p>
          <h2>托管应用随 VPS 一起选择</h2>
          <div className="customer-preview__app-list">
            {apps.map((app) => (
              <article className="customer-preview__app-card" key={app.label}>
                <VisualIcon glyph={app.glyph} label={app.label} tone={app.tone} />
                <div>
                  <strong>{app.label}</strong>
                  <p>{app.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="customer-preview__section customer-preview__flow">
        {flowSteps.map((step, index) => (
          <article className="customer-preview__flow-step" key={step}>
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </article>
        ))}
      </section>

      <section className="customer-preview__section customer-preview__ai" id="ai-workbench">
        <div>
          <p className="eyebrow">AI workspace</p>
          <h2>应用生成和部署入口统一进入 AI 工作台</h2>
          <p>
            客户可以先购买 VPS，也可以直接描述“帮我部署一个 GitHub 仓库”。真实环境中，模型、支付和
            VPS 控制都通过私有配置接入；公开仓库只保留安全的适配器接口和预览壳层。
          </p>
        </div>
        <a className="button primary" href="https://github.com/shulaiyun/Sloth-Cloud#configuration" rel="noreferrer" target="_blank">
          查看接入说明
        </a>
      </section>
    </div>
  );
}
