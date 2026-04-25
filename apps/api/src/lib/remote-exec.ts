import { Client } from 'ssh2';

export interface RemoteExecConnector {
  host: string;
  port: number;
  username: string;
  password?: string | null;
  sshKey?: string | null;
  sshPassphrase?: string | null;
  agentSocket?: string | null;
  readyTimeoutMs?: number;
}

export interface RemoteExecStep {
  id: string;
  label: string;
  script: string;
  timeoutMs?: number;
}

export interface RemoteExecStepResult {
  id: string;
  label: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
}

export interface RemoteExecRunResult {
  steps: RemoteExecStepResult[];
  totalDurationMs: number;
}

export interface RemotePlaybook {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  stepLabels: string[];
  panelLabel?: string | null;
  panelPort?: number | null;
  panelPath?: string | null;
  defaultUsername?: string | null;
  defaultPassword?: string | null;
  steps: RemoteExecStep[];
}

function dockerBootstrapScript() {
  return `
if command -v docker >/dev/null 2>&1; then
  echo "docker already installed"
  docker --version || true
  exit 0
fi

if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get -o DPkg::Lock::Timeout=120 update
  apt-get -o DPkg::Lock::Timeout=120 install -y ca-certificates curl gnupg lsb-release
  install -m 0755 -d /etc/apt/keyrings
  . /etc/os-release
  if curl -fsSL "https://download.docker.com/linux/$ID/gpg" | gpg --dearmor --batch --yes -o /etc/apt/keyrings/docker.gpg; then
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
    if ! apt-get -o DPkg::Lock::Timeout=120 update || ! apt-get -o DPkg::Lock::Timeout=120 install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin; then
      echo "docker-ce repository unavailable, falling back to distro packages"
      apt-get -o DPkg::Lock::Timeout=120 install -y docker.io docker-compose-plugin || apt-get -o DPkg::Lock::Timeout=120 install -y docker.io docker-compose
    fi
  else
    echo "docker apt key unavailable, falling back to distro packages"
    apt-get -o DPkg::Lock::Timeout=120 install -y docker.io docker-compose-plugin || apt-get -o DPkg::Lock::Timeout=120 install -y docker.io docker-compose
  fi
elif command -v dnf >/dev/null 2>&1; then
  dnf -y install dnf-plugins-core
  dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
  dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
elif command -v yum >/dev/null 2>&1; then
  yum -y install yum-utils
  yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
  yum -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  echo "Unsupported Linux distribution for Docker bootstrap" >&2
  exit 1
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl enable --now docker || true
fi

docker --version
docker compose version || true
`.trim();
}

function nginxProxyManagerScript() {
  return `
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
docker ps --filter name=nginx-proxy-manager --format '{{.Names}} {{.Status}}'
`.trim();
}

const remotePlaybooks: RemotePlaybook[] = [
  {
    id: 'bootstrap-docker',
    name: 'Docker Engine',
    description: 'Install Docker Engine and Docker Compose on the target server.',
    keywords: ['docker', 'docker compose', '安装docker', '装docker', 'docker环境', '容器环境'],
    stepLabels: ['检查并安装 Docker'],
    steps: [
      {
        id: 'bootstrap-docker',
        label: 'Bootstrap Docker',
        script: dockerBootstrapScript(),
        timeoutMs: 10 * 60 * 1000,
      },
    ],
  },
  {
    id: 'install-nginx-proxy-manager-direct',
    name: 'Nginx Proxy Manager',
    description: 'Directly connect to the server through SSH, bootstrap Docker when needed, and deploy Nginx Proxy Manager.',
    keywords: [
      'nginx proxy manager',
      'nginx-proxy-manager',
      'proxy manager',
      '反向代理管理器',
      'nginx面板',
    ],
    stepLabels: ['检查并安装 Docker', '部署 Nginx Proxy Manager'],
    panelLabel: 'Nginx Proxy Manager',
    panelPort: 81,
    panelPath: '/',
    defaultUsername: 'admin@example.com',
    defaultPassword: 'changeme',
    steps: [
      {
        id: 'bootstrap-docker',
        label: 'Bootstrap Docker',
        script: dockerBootstrapScript(),
        timeoutMs: 10 * 60 * 1000,
      },
      {
        id: 'deploy-nginx-proxy-manager',
        label: 'Deploy Nginx Proxy Manager',
        script: nginxProxyManagerScript(),
        timeoutMs: 10 * 60 * 1000,
      },
    ],
  },
];

export function listRemotePlaybooks() {
  return remotePlaybooks.map((playbook) => ({ ...playbook }));
}

export function getRemotePlaybook(playbookId: string | null | undefined) {
  if (!playbookId) {
    return null;
  }

  return remotePlaybooks.find((playbook) => playbook.id === playbookId) ?? null;
}

export function matchRemotePlaybook(message: string) {
  const normalized = message.toLowerCase();
  let best: { playbook: RemotePlaybook; score: number } | null = null;

  for (const playbook of remotePlaybooks) {
    let score = 0;
    for (const keyword of playbook.keywords) {
      if (normalized.includes(keyword)) {
        score = Math.max(score, keyword.length);
      }
    }

    if (score <= 0) {
      continue;
    }

    if (!best || score > best.score) {
      best = { playbook, score };
    }
  }

  return best?.playbook ?? null;
}

export class RemoteExecError extends Error {
  code: string;
  stepId: string | null;
  stepLabel: string | null;
  stdout: string;
  stderr: string;
  partialSteps: RemoteExecStepResult[];
  totalDurationMs: number | null;

  constructor(input: {
    message: string;
    code: string;
    stepId?: string | null;
    stepLabel?: string | null;
    stdout?: string;
    stderr?: string;
    partialSteps?: RemoteExecStepResult[];
    totalDurationMs?: number | null;
  }) {
    super(input.message);
    this.name = 'RemoteExecError';
    this.code = input.code;
    this.stepId = input.stepId ?? null;
    this.stepLabel = input.stepLabel ?? null;
    this.stdout = input.stdout ?? '';
    this.stderr = input.stderr ?? '';
    this.partialSteps = Array.isArray(input.partialSteps) ? input.partialSteps : [];
    this.totalDurationMs = typeof input.totalDurationMs === 'number' ? input.totalDurationMs : null;
  }
}

function shellForConnector(connector: RemoteExecConnector) {
  if (connector.username === 'root') {
    return {
      command: 'bash -se',
      passwordPrefix: '',
    };
  }

  if (connector.password) {
    return {
      command: 'sudo -S -p "" bash -se',
      passwordPrefix: `${connector.password}\n`,
    };
  }

  return {
    command: 'sudo -n bash -se',
    passwordPrefix: '',
  };
}

async function connect(connector: RemoteExecConnector) {
  return await new Promise<Client>((resolve, reject) => {
    const client = new Client();
    client
      .on('ready', () => resolve(client))
      .on('error', (error) => reject(error));

    client.connect({
      host: connector.host,
      port: connector.port,
      username: connector.username,
      password: connector.password ?? undefined,
      privateKey: connector.sshKey ?? undefined,
      passphrase: connector.sshPassphrase ?? undefined,
      agent: connector.agentSocket ?? undefined,
      readyTimeout: connector.readyTimeoutMs ?? 20_000,
      keepaliveInterval: 10_000,
      keepaliveCountMax: 3,
    });
  });
}

async function executeStep(
  client: Client,
  connector: RemoteExecConnector,
  step: RemoteExecStep,
) {
  const shell = shellForConnector(connector);
  const startedAt = Date.now();

  return await new Promise<RemoteExecStepResult>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeoutMs = step.timeoutMs ?? 5 * 60 * 1000;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      client.end();
      reject(new RemoteExecError({
        message: `Remote step timed out: ${step.label}`,
        code: 'REMOTE_EXEC_TIMEOUT',
        stepId: step.id,
        stepLabel: step.label,
        stdout,
        stderr,
      }));
    }, timeoutMs);

    client.exec(shell.command, (error, stream) => {
      if (error) {
        clearTimeout(timeout);
        if (settled) {
          return;
        }
        settled = true;
        reject(new RemoteExecError({
          message: `Failed to start remote step: ${step.label}`,
          code: 'REMOTE_EXEC_START_FAILED',
          stepId: step.id,
          stepLabel: step.label,
          stdout,
          stderr: `${stderr}\n${String(error)}`.trim(),
        }));
        return;
      }

      stream.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      stream.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      stream.on('close', (code: number | null, signal: string | null) => {
        clearTimeout(timeout);
        if (settled) {
          return;
        }
        settled = true;
        const result: RemoteExecStepResult = {
          id: step.id,
          label: step.label,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code,
          signal,
          durationMs: Date.now() - startedAt,
        };

        if (code !== 0) {
          reject(new RemoteExecError({
            message: `Remote step failed: ${step.label}`,
            code: 'REMOTE_EXEC_STEP_FAILED',
            stepId: step.id,
            stepLabel: step.label,
            stdout: result.stdout,
            stderr: result.stderr,
          }));
          return;
        }

        resolve(result);
      });

      const script = ['set -euo pipefail', step.script, ''].join('\n');
      stream.end(`${shell.passwordPrefix}${script}`);
    });
  });
}

export async function runRemotePlaybook(input: {
  connector: RemoteExecConnector;
  playbook: RemotePlaybook;
}) {
  return await runRemoteSteps({
    connector: input.connector,
    steps: input.playbook.steps,
  });
}

export async function runRemoteSteps(input: {
  connector: RemoteExecConnector;
  steps: RemoteExecStep[];
}) {
  const client = await connect(input.connector);
  const startedAt = Date.now();
  const results: RemoteExecStepResult[] = [];

  try {
    for (const step of input.steps) {
      try {
        const result = await executeStep(client, input.connector, step);
        results.push(result);
      } catch (error) {
        if (error instanceof RemoteExecError) {
          error.partialSteps = [...results];
          error.totalDurationMs = Date.now() - startedAt;
        }
        throw error;
      }
    }
  } finally {
    client.end();
  }

  return {
    steps: results,
    totalDurationMs: Date.now() - startedAt,
  } satisfies RemoteExecRunResult;
}
