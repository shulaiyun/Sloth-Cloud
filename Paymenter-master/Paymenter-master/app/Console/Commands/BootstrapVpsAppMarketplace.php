<?php

namespace App\Console\Commands;

use App\Models\VpsApp;
use App\Models\VpsAppCategory;
use App\Models\VpsAppRecipe;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class BootstrapVpsAppMarketplace extends Command
{
    protected $signature = 'app:vps-apps:bootstrap-marketplace {--dry-run : Preview catalog changes without writing}';

    protected $description = 'Create or update the default VPS app marketplace catalog for Convoy-based VPS products.';

    public function handle(): int
    {
        $payload = $this->catalogDefinition();

        if ((bool) $this->option('dry-run')) {
            foreach ($payload['categories'] as $category) {
                $this->line(sprintf('[dry-run] category=%s apps=%d', $category['slug'], count($category['apps'])));
            }

            return self::SUCCESS;
        }

        DB::transaction(function () use ($payload): void {
            foreach ($payload['categories'] as $categoryDefinition) {
                $category = VpsAppCategory::query()->updateOrCreate(
                    ['slug' => $categoryDefinition['slug']],
                    [
                        'name' => $categoryDefinition['name'],
                        'description' => $categoryDefinition['description'],
                        'icon' => $categoryDefinition['icon'],
                        'search_keywords' => $categoryDefinition['search_keywords'],
                        'sort' => $categoryDefinition['sort'],
                        'enabled' => true,
                    ],
                );

                foreach ($categoryDefinition['apps'] as $appDefinition) {
                    $app = VpsApp::query()->updateOrCreate(
                        ['slug' => $appDefinition['slug']],
                        [
                            'vps_app_category_id' => $category->id,
                            'name' => $appDefinition['name'],
                            'description' => $appDefinition['description'],
                            'icon' => $appDefinition['icon'],
                            'app_type' => $appDefinition['app_type'],
                            'tagline' => $appDefinition['tagline'],
                            'search_keywords' => $appDefinition['search_keywords'],
                            'featured' => $appDefinition['featured'],
                            'enabled' => true,
                            'allow_on_existing_service' => $appDefinition['allow_on_existing_service'],
                            'sort' => $appDefinition['sort'],
                        ],
                    );

                    foreach ($appDefinition['recipes'] as $recipeDefinition) {
                        VpsAppRecipe::query()->updateOrCreate(
                            [
                                'vps_app_id' => $app->id,
                                'os_version' => $recipeDefinition['os_version'],
                            ],
                            [
                                'install_strategy' => $recipeDefinition['install_strategy'],
                                'template_ref' => $recipeDefinition['template_ref'],
                                'script_body' => $recipeDefinition['script_body'],
                                'dependencies' => $recipeDefinition['dependencies'],
                                'conflicts' => $recipeDefinition['conflicts'],
                                'default_login_username' => $recipeDefinition['default_login_username'],
                                'panel_port' => $recipeDefinition['panel_port'],
                                'panel_path' => $recipeDefinition['panel_path'],
                                'panel_scheme' => $recipeDefinition['panel_scheme'],
                                'panel_label' => $recipeDefinition['panel_label'],
                                'script_timeout_seconds' => $recipeDefinition['script_timeout_seconds'],
                                'allow_on_existing_service' => $recipeDefinition['allow_on_existing_service'],
                                'enabled' => true,
                                'sort' => $recipeDefinition['sort'],
                                'notes' => $recipeDefinition['notes'],
                            ],
                        );
                    }
                }
            }
        });

        $this->info('VPS app marketplace catalog bootstrapped.');

        return self::SUCCESS;
    }

    /**
     * @return array{
     *   categories: array<int, array{
     *     slug: string,
     *     name: string,
     *     description: string,
     *     icon: string,
     *     search_keywords: array<int, string>,
     *     sort: int,
     *     apps: array<int, array<string, mixed>>
     *   }>
     * }
     */
    protected function catalogDefinition(): array
    {
        $supportedOs = (array) config('vps_apps.recipe_seed_os', config('vps_apps.supported_os', []));
        $mainConflicts = ['1panel', 'aapanel', 'portainer', 'coolify', 'casaos'];

        $categories = [
            [
                'slug' => 'control-panels',
                'name' => '控制面板',
                'description' => '适合快速交付主面板和服务器入口的主应用。',
                'icon' => 'ri-dashboard-line',
                'search_keywords' => ['panel', '控制面板', '主应用'],
                'sort' => 10,
                'apps' => [
                    $this->appDefinition('1panel', '1Panel', '现代化 Linux 服务器运维面板。', '快速搭建站点、容器与数据库。', 'ri-dashboard-horizontal-line', VpsApp::TYPE_MAIN, 10, true, false,
                        fn (string $os, int $sort) => $this->recipeDefinition($os, VpsAppRecipe::STRATEGY_HYBRID, '1Panel', $this->scriptFor('1panel'), [], array_values(array_diff($mainConflicts, ['1panel'])), 'root', 10086, null, 'http', '1Panel', 1200, false, $sort, 'Use template when the regional node publishes a dedicated 1Panel image.')
                    ),
                    $this->appDefinition('aapanel', 'aaPanel / 宝塔', '面向站点和 LNMP/LAMP 场景的老牌面板。', '适合传统建站与常规运维。', 'ri-window-line', VpsApp::TYPE_MAIN, 20, false, false,
                        fn (string $os, int $sort) => $this->recipeDefinition($os, VpsAppRecipe::STRATEGY_HYBRID, 'aaPanel', $this->scriptFor('aapanel'), [], array_values(array_diff($mainConflicts, ['aapanel'])), 'root', 8888, null, 'http', 'aaPanel', 1500, false, $sort, 'Use template when available; otherwise install from official aaPanel script.')
                    ),
                    $this->appDefinition('portainer', 'Portainer', '面向 Docker 主机的可视化容器管理台。', '适合以容器为核心的轻量管理。', 'ri-layout-masonry-line', VpsApp::TYPE_MAIN, 30, true, false,
                        fn (string $os, int $sort) => $this->recipeDefinition($os, VpsAppRecipe::STRATEGY_HYBRID, 'Portainer', $this->scriptFor('portainer'), ['docker-ce', 'docker-compose'], array_values(array_diff($mainConflicts, ['portainer'])), 'root', 9000, null, 'http', 'Portainer', 1500, false, $sort, 'Portainer depends on Docker and Docker Compose.')
                    ),
                    $this->appDefinition('coolify', 'Coolify', '自托管应用平台，适合多项目持续部署。', '适合 DevOps 与 PaaS 风格交付。', 'ri-rocket-2-line', VpsApp::TYPE_MAIN, 40, true, false,
                        fn (string $os, int $sort) => $this->recipeDefinition($os, VpsAppRecipe::STRATEGY_HYBRID, 'Coolify', $this->scriptFor('coolify'), ['docker-ce', 'docker-compose'], array_values(array_diff($mainConflicts, ['coolify'])), 'root', 8000, null, 'http', 'Coolify', 1800, false, $sort, 'Coolify uses Docker for runtime services.')
                    ),
                    $this->appDefinition('casaos', 'CasaOS', '更偏向轻应用和家庭实验室的图形面板。', '适合简单 NAS、轻应用和 Docker 管理。', 'ri-home-smile-2-line', VpsApp::TYPE_MAIN, 50, false, false,
                        fn (string $os, int $sort) => $this->recipeDefinition($os, VpsAppRecipe::STRATEGY_HYBRID, 'CasaOS', $this->scriptFor('casaos'), ['docker-ce'], array_values(array_diff($mainConflicts, ['casaos'])), 'root', 80, null, 'http', 'CasaOS', 1500, false, $sort, 'CasaOS is exposed on port 80 after install.')
                    ),
                ],
            ],
            [
                'slug' => 'containers-runtime',
                'name' => '容器与运行时',
                'description' => 'Docker 运行时及其配套工具。',
                'icon' => 'ri-stack-line',
                'search_keywords' => ['docker', 'container', 'runtime'],
                'sort' => 20,
                'apps' => [
                    $this->appDefinition('docker-ce', 'Docker CE', 'Docker 社区版运行时。', '容器类能力的基础依赖。', 'ri-ship-line', VpsApp::TYPE_ADDON, 10, true, true,
                        fn (string $os, int $sort) => $this->recipeDefinition($os, VpsAppRecipe::STRATEGY_SCRIPT, null, $this->scriptFor('docker-ce'), [], [], 'root', null, null, null, null, 1200, true, $sort, 'Installs Docker CE from official repository.')
                    ),
                    $this->appDefinition('docker-compose', 'Docker Compose', 'Docker Compose v2 插件。', '适合一键运行多容器应用。', 'ri-node-tree', VpsApp::TYPE_ADDON, 20, false, true,
                        fn (string $os, int $sort) => $this->recipeDefinition($os, VpsAppRecipe::STRATEGY_SCRIPT, null, $this->scriptFor('docker-compose'), ['docker-ce'], [], 'root', null, null, null, null, 600, true, $sort, 'Requires Docker CE.')
                    ),
                    $this->appDefinition('uptime-kuma', 'Uptime Kuma', '轻量监控面板。', '快速监控站点与端口可用性。', 'ri-pulse-line', VpsApp::TYPE_ADDON, 30, true, true,
                        fn (string $os, int $sort) => $this->recipeDefinition($os, VpsAppRecipe::STRATEGY_SCRIPT, null, $this->scriptFor('uptime-kuma'), ['docker-ce', 'docker-compose'], [], 'root', 3001, null, 'http', 'Uptime Kuma', 1200, true, $sort, 'Deploys Uptime Kuma in Docker.')
                    ),
                ],
            ],
            [
                'slug' => 'web-and-proxy',
                'name' => 'Web 与代理',
                'description' => '常见的 Web 服务和反向代理组件。',
                'icon' => 'ri-global-line',
                'search_keywords' => ['nginx', 'proxy', 'caddy', 'web'],
                'sort' => 30,
                'apps' => [
                    $this->appDefinition('nginx', 'Nginx', '经典高性能 Web 服务器。', '适合作为站点和反向代理基础。', 'ri-server-line', VpsApp::TYPE_ADDON, 10, true, true,
                        fn (string $os, int $sort) => $this->recipeDefinition($os, VpsAppRecipe::STRATEGY_SCRIPT, null, $this->scriptFor('nginx'), [], ['openresty', 'caddy'], 'root', 80, null, 'http', 'Nginx', 600, true, $sort, 'Installs nginx via apt.')
                    ),
                    $this->appDefinition('openresty', 'OpenResty', '带 Lua 扩展的 Nginx 发行版。', '适合更灵活的网关与 Lua 场景。', 'ri-code-box-line', VpsApp::TYPE_ADDON, 20, false, true,
                        fn (string $os, int $sort) => $this->recipeDefinition($os, VpsAppRecipe::STRATEGY_SCRIPT, null, $this->scriptFor('openresty'), [], ['nginx', 'caddy'], 'root', 80, null, 'http', 'OpenResty', 900, true, $sort, 'Conflicts with nginx and caddy because they share the same web role.')
                    ),
                    $this->appDefinition('caddy', 'Caddy', '自动 HTTPS 的现代 Web 服务器。', '适合快速反代与静态站点。', 'ri-lock-star-line', VpsApp::TYPE_ADDON, 30, false, true,
                        fn (string $os, int $sort) => $this->recipeDefinition($os, VpsAppRecipe::STRATEGY_SCRIPT, null, $this->scriptFor('caddy'), [], ['nginx', 'openresty'], 'root', 80, null, 'http', 'Caddy', 900, true, $sort, 'Conflicts with nginx and openresty.')
                    ),
                    $this->appDefinition('nginx-proxy-manager', 'Nginx Proxy Manager', '可视化反向代理与证书管理面板。', '适合多站点 HTTPS、转发规则与统一入口。', 'ri-route-line', VpsApp::TYPE_ADDON, 40, true, true,
                        fn (string $os, int $sort) => $this->recipeDefinition($os, VpsAppRecipe::STRATEGY_SCRIPT, null, $this->scriptFor('nginx-proxy-manager'), ['docker-ce', 'docker-compose'], ['nginx', 'openresty', 'caddy'], 'root', 81, null, 'http', 'Nginx Proxy Manager', 1200, true, $sort, 'Deploys Nginx Proxy Manager in Docker with the default bootstrap credentials.')
                    ),
                ],
            ],
            [
                'slug' => 'databases',
                'name' => '数据库与消息队列',
                'description' => '常用数据库、中间件和对象存储。', 
                'icon' => 'ri-database-2-line',
                'search_keywords' => ['mysql', 'redis', 'postgres', 'mq'],
                'sort' => 40,
                'apps' => [
                    $this->addonWithPackage('mysql', 'MySQL', '官方 MySQL 社区服务。', 'ri-database-line', 10, 3306),
                    $this->addonWithPackage('mariadb', 'MariaDB', '兼容 MySQL 的开源分支。', 'ri-database-line', 20, 3306),
                    $this->addonWithPackage('postgresql', 'PostgreSQL', '稳健的关系型数据库。', 'ri-database-line', 30, 5432),
                    $this->addonWithPackage('redis', 'Redis', '高性能内存数据存储。', 'ri-database-line', 40, 6379),
                    $this->addonWithPackage('mongodb', 'MongoDB', '文档型数据库。', 'ri-database-line', 50, 27017),
                    $this->addonWithPackage('rabbitmq', 'RabbitMQ', '消息队列服务。', 'ri-exchange-funds-line', 60, 5672),
                    $this->appDefinition('minio', 'MinIO', '兼容 S3 的对象存储。', '轻量对象存储服务。', 'ri-hard-drive-3-line', VpsApp::TYPE_ADDON, 70, false, true,
                        fn (string $os, int $sort) => $this->recipeDefinition($os, VpsAppRecipe::STRATEGY_SCRIPT, null, $this->scriptFor('minio'), ['docker-ce', 'docker-compose'], [], 'root', 9001, null, 'http', 'MinIO Console', 1200, true, $sort, 'Deploys MinIO via Docker.')
                    ),
                ],
            ],
            [
                'slug' => 'developer-tools',
                'name' => '开发者工具',
                'description' => '快速补齐常见语言运行时。', 
                'icon' => 'ri-terminal-line',
                'search_keywords' => ['node', 'python', 'java', 'developer'],
                'sort' => 50,
                'apps' => [
                    $this->addonWithPackage('nodejs-lts', 'Node.js LTS', 'LTS 版本 Node.js 运行时。', 'ri-javascript-line', 10, null),
                    $this->addonWithPackage('python-312', 'Python 3.12', 'Python 3.12 运行时与 venv。', 'ri-code-s-slash-line', 20, null),
                    $this->addonWithPackage('openjdk-21', 'OpenJDK 21', 'Java 21 运行时。', 'ri-cup-line', 30, null),
                ],
            ],
        ];

        foreach ($categories as &$category) {
            foreach ($category['apps'] as &$app) {
                $recipes = [];
                foreach ($supportedOs as $index => $os) {
                    $recipes[] = $app['recipe_factory']($os, ($index + 1) * 10);
                }
                unset($app['recipe_factory']);
                $app['recipes'] = $recipes;
            }
        }

        return [
            'categories' => $categories,
        ];
    }

    /**
     * @param  callable(string, int): array<string, mixed>  $recipeFactory
     * @return array<string, mixed>
     */
    protected function appDefinition(
        string $slug,
        string $name,
        string $description,
        string $tagline,
        string $icon,
        string $appType,
        int $sort,
        bool $featured,
        bool $allowOnExistingService,
        callable $recipeFactory,
    ): array {
        return [
            'slug' => $slug,
            'name' => $name,
            'description' => $description,
            'tagline' => $tagline,
            'icon' => $icon,
            'app_type' => $appType,
            'sort' => $sort,
            'featured' => $featured,
            'allow_on_existing_service' => $allowOnExistingService,
            'search_keywords' => array_values(array_filter([
                $slug,
                strtolower($name),
                $tagline,
            ])),
            'recipe_factory' => $recipeFactory,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function addonWithPackage(
        string $slug,
        string $name,
        string $description,
        string $icon,
        int $sort,
        ?int $panelPort,
    ): array {
        return $this->appDefinition(
            $slug,
            $name,
            $description,
            '适合已有 VPS 追加安装的基础组件。',
            $icon,
            VpsApp::TYPE_ADDON,
            $sort,
            false,
            true,
            fn (string $os, int $recipeSort) => $this->recipeDefinition(
                $os,
                VpsAppRecipe::STRATEGY_SCRIPT,
                null,
                $this->scriptFor($slug),
                [],
                [],
                'root',
                $panelPort,
                null,
                $panelPort ? 'http' : null,
                $panelPort ? $name : null,
                900,
                true,
                $recipeSort,
                'Installs the package with sensible service defaults.',
            ),
        );
    }

    /**
     * @return array<string, mixed>
     */
    protected function recipeDefinition(
        string $os,
        string $installStrategy,
        ?string $templateRef,
        string $scriptBody,
        array $dependencies,
        array $conflicts,
        ?string $defaultLoginUsername,
        ?int $panelPort,
        ?string $panelPath,
        ?string $panelScheme,
        ?string $panelLabel,
        int $scriptTimeoutSeconds,
        bool $allowOnExistingService,
        int $sort,
        ?string $notes,
    ): array {
        return [
            'os_version' => $os,
            'install_strategy' => $installStrategy,
            'template_ref' => $templateRef,
            'script_body' => $scriptBody,
            'dependencies' => array_values(array_unique(array_filter(array_map('strval', $dependencies)))),
            'conflicts' => array_values(array_unique(array_filter(array_map('strval', $conflicts)))),
            'default_login_username' => $defaultLoginUsername,
            'panel_port' => $panelPort,
            'panel_path' => $panelPath,
            'panel_scheme' => $panelScheme,
            'panel_label' => $panelLabel,
            'script_timeout_seconds' => $scriptTimeoutSeconds,
            'allow_on_existing_service' => $allowOnExistingService,
            'sort' => $sort,
            'notes' => $notes,
        ];
    }

    protected function scriptFor(string $slug): string
    {
        return match ($slug) {
            '1panel' => <<<'BASH'
apt-get update -y
apt-get install -y curl sudo
curl -fsSL https://resource.fit2cloud.com/1panel/package/quick_start.sh -o /tmp/1panel-install.sh
bash /tmp/1panel-install.sh
echo "1Panel install finished."
BASH,
            'aapanel' => <<<'BASH'
apt-get update -y
apt-get install -y curl sudo
AA_PANEL_PORT="${AA_PANEL_PORT:-8888}"
curl -fsSL https://www.aapanel.com/script/install_7.0_en.sh -o /tmp/aapanel-install.sh
INSTALL_FORCE=true bash /tmp/aapanel-install.sh aapanel -y -P "${AA_PANEL_PORT}"
if [ -f /www/server/panel/data/admin_path.pl ]; then
  echo "/bt" > /www/server/panel/data/admin_path.pl
  /etc/init.d/bt restart
fi
AA_PANEL_PORT="$(cat /www/server/panel/data/port.pl 2>/dev/null || printf '%s' "${AA_PANEL_PORT}")"
echo "SLOTH_PANEL_URL=https://SERVER_IP:${AA_PANEL_PORT}/bt"
bt default || true
echo "aaPanel install finished."
BASH,
            'docker-ce' => <<<'BASH'
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/$(. /etc/os-release && echo "$ID")/gpg | gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
source /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker --version
BASH,
            'docker-compose' => <<<'BASH'
apt-get update -y
apt-get install -y docker-compose-plugin
docker compose version
BASH,
            'portainer' => <<<'BASH'
docker volume create portainer_data
docker rm -f portainer >/dev/null 2>&1 || true
docker run -d \
  --name portainer \
  --restart unless-stopped \
  -p 9000:9000 \
  -p 9443:9443 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
echo "Portainer install finished."
BASH,
            'coolify' => <<<'BASH'
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
echo "Coolify install finished."
BASH,
            'casaos' => <<<'BASH'
curl -fsSL https://get.casaos.io | bash
echo "CasaOS install finished."
BASH,
            'nginx' => <<<'BASH'
apt-get update -y
apt-get install -y nginx
systemctl enable --now nginx
nginx -v
BASH,
            'openresty' => <<<'BASH'
apt-get update -y
apt-get install -y curl gnupg2 ca-certificates lsb-release ubuntu-keyring
if [ ! -f /usr/share/keyrings/openresty.gpg ]; then
  curl -fsSL https://openresty.org/package/pubkey.gpg | gpg --batch --yes --dearmor -o /usr/share/keyrings/openresty.gpg
fi
source /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/openresty.gpg] http://openresty.org/package/${ID} ${VERSION_CODENAME} openresty" > /etc/apt/sources.list.d/openresty.list
apt-get update -y
apt-get install -y openresty
systemctl enable --now openresty
openresty -v
BASH,
            'caddy' => <<<'BASH'
apt-get update -y
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y caddy
systemctl enable --now caddy
caddy version
BASH,
            'nginx-proxy-manager' => <<<'BASH'
mkdir -p /opt/nginx-proxy-manager/data
mkdir -p /opt/nginx-proxy-manager/letsencrypt
cat > /opt/nginx-proxy-manager/docker-compose.yml <<'EOF'
services:
  app:
    image: jc21/nginx-proxy-manager:latest
    restart: unless-stopped
    ports:
      - "80:80"
      - "81:81"
      - "443:443"
    volumes:
      - /opt/nginx-proxy-manager/data:/data
      - /opt/nginx-proxy-manager/letsencrypt:/etc/letsencrypt
EOF
docker rm -f nginx-proxy-manager >/dev/null 2>&1 || true
docker compose -f /opt/nginx-proxy-manager/docker-compose.yml up -d
echo "SLOTH_PANEL_URL=http://SERVER_IP:81"
echo "SLOTH_PANEL_USERNAME=admin@example.com"
echo "SLOTH_PANEL_PASSWORD=changeme"
echo "Nginx Proxy Manager install finished."
BASH,
            'mysql' => <<<'BASH'
apt-get update -y
apt-get install -y mysql-server
systemctl enable --now mysql
mysql --version
BASH,
            'mariadb' => <<<'BASH'
apt-get update -y
apt-get install -y mariadb-server
systemctl enable --now mariadb
mysql --version
BASH,
            'postgresql' => <<<'BASH'
apt-get update -y
apt-get install -y postgresql postgresql-contrib
systemctl enable --now postgresql
psql --version
BASH,
            'redis' => <<<'BASH'
apt-get update -y
apt-get install -y redis-server
systemctl enable --now redis-server
redis-server --version
BASH,
            'mongodb' => <<<'BASH'
apt-get update -y
apt-get install -y gnupg curl
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | gpg --batch --yes --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
source /etc/os-release
echo "deb [ arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu ${VERSION_CODENAME}/mongodb-org/7.0 multiverse" > /etc/apt/sources.list.d/mongodb-org-7.0.list
apt-get update -y
apt-get install -y mongodb-org
systemctl enable --now mongod
mongod --version
BASH,
            'rabbitmq' => <<<'BASH'
apt-get update -y
apt-get install -y rabbitmq-server
systemctl enable --now rabbitmq-server
rabbitmqctl status
BASH,
            'minio' => <<<'BASH'
mkdir -p /opt/minio/data
docker rm -f minio >/dev/null 2>&1 || true
docker run -d \
  --name minio \
  --restart unless-stopped \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=MinioAdmin123! \
  -v /opt/minio/data:/data \
  quay.io/minio/minio server /data --console-address ":9001"
echo "MinIO install finished."
BASH,
            'uptime-kuma' => <<<'BASH'
mkdir -p /opt/uptime-kuma
docker rm -f uptime-kuma >/dev/null 2>&1 || true
docker run -d \
  --name uptime-kuma \
  --restart unless-stopped \
  -p 3001:3001 \
  -v /opt/uptime-kuma:/app/data \
  louislam/uptime-kuma:1
echo "Uptime Kuma install finished."
BASH,
            'nodejs-lts' => <<<'BASH'
apt-get update -y
apt-get install -y curl ca-certificates gnupg
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --batch --yes --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
apt-get update -y
apt-get install -y nodejs
node -v
npm -v
BASH,
            'python-312' => <<<'BASH'
apt-get update -y
apt-get install -y python3.12 python3.12-venv python3-pip
python3.12 --version
pip3 --version
BASH,
            'openjdk-21' => <<<'BASH'
apt-get update -y
apt-get install -y openjdk-21-jdk
java -version
BASH,
            default => 'echo "No installer script defined."',
        };
    }
}
