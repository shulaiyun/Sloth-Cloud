import { spawn } from 'node:child_process';

import type { ServiceDetail, ServiceRuntimeSnapshot } from '../types.js';

type LoggerLike = {
  info(payload: unknown, message?: string): void;
  warn(payload: unknown, message?: string): void;
  error(payload: unknown, message?: string): void;
};

type ManagedAppManagerConfig = {
  enabled: boolean;
  driver: 'contract' | 'kubeconfig' | 'in-cluster';
  kubeconfigPath?: string;
  defaultClusterRef: string;
  namespacePrefix: string;
  buildNamespace?: string;
  buildkitImage: string;
  gitCloneImage: string;
  imageRegistry?: string;
  imageRepositoryPrefix: string;
  registryAuthJson?: string;
  ingressClass?: string;
  defaultDomainSuffix?: string;
  certIssuer?: string;
  storageClass?: string;
  logger: LoggerLike;
};

type InternalServicePayload = {
  id?: string;
  label?: string;
  base_label?: string;
  product?: {
    slug?: string;
  };
};

type ServiceInput = ServiceDetail | InternalServicePayload;

type ManagedAppSpec = {
  serviceId: string;
  serviceLabel: string;
  productSlug: string;
  runtimeRef: string;
  clusterRef: string;
  namespace: string;
  workloadName: string;
  workloadKind: 'Deployment' | 'StatefulSet';
  serviceName: string;
  ingressName: string;
  envSecretName: string;
  pvcName: string;
  buildJobName: string;
  imagePullSecretName: string;
  imageRef: string;
  desiredReplicas: number;
  replicaLimit: number;
  runtimePort: number;
  storageSize: string | null;
  gitRepoUrl: string;
  gitBranch: string;
  gitContextDir: string;
  dockerfilePath: string;
  domain: string | null;
  ingressEnabled: boolean;
  tlsEnabled: boolean;
  envVars: Record<string, string>;
  buildNamespace: string;
  buildTimestamp: string;
  runtimeCpuLimit: string | null;
  runtimeMemoryLimit: string | null;
  buildCpuLimit: string | null;
  buildMemoryLimit: string | null;
  previousImageRef: string | null;
  domainLimit: number;
  envVarLimit: number;
  logRetentionLines: number;
  resourceQuotaName: string;
  limitRangeName: string;
  ingressPolicyName: string;
  egressPolicyName: string;
  metadataConfigMapName: string;
  imageTag: string;
};

type ManagedAppSnapshot = {
  runtime: ServiceRuntimeSnapshot & {
    domain: string | null;
    tlsStatus: string | null;
    replicas: number | null;
    envJson: string | null;
  };
  properties: Record<string, string>;
};

class ManagedAppRuntimeError extends Error {
  statusCode: number;
  code: string;
  detail?: unknown;

  constructor(message: string, statusCode = 500, code = 'MANAGED_APP_RUNTIME_ERROR', detail?: unknown) {
    super(message);
    this.name = 'ManagedAppRuntimeError';
    this.statusCode = statusCode;
    this.code = code;
    this.detail = detail;
  }
}

function getStringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getNumberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getBooleanValue(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }

  return fallback;
}

function slugify(input: string, fallback: string) {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);

  return normalized || fallback;
}

function shQuote(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function parseEnvVars(rawValue: unknown) {
  if (typeof rawValue === 'object' && rawValue !== null && !Array.isArray(rawValue)) {
    return Object.fromEntries(Object.entries(rawValue as Record<string, unknown>).map(([key, value]) => [key, String(value ?? '')]));
  }

  const value = getStringValue(rawValue);
  if (!value) return {};

  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).map(([key, entry]) => [key, String(entry ?? '')]));
    }
  } catch {
    return {};
  }

  return {};
}

function buildPropertyMap(service: ServiceInput, propertyMap?: Map<string, string>, serviceProperties?: Record<string, unknown>) {
  const map = new Map<string, string>();

  if (propertyMap) {
    for (const [key, value] of propertyMap.entries()) {
      if (key && value) map.set(key.toLowerCase(), value);
    }
  }

  if ('properties' in service && Array.isArray(service.properties)) {
    for (const property of service.properties) {
      const key = getStringValue(property?.key).toLowerCase();
      const value = getStringValue(property?.value);
      if (key && value) map.set(key, value);
    }
  }

  if ('configs' in service && Array.isArray(service.configs)) {
    for (const entry of service.configs) {
      const key = getStringValue(entry.option?.envVariable).toLowerCase();
      const value = getStringValue(entry.value?.envVariable) || getStringValue(entry.value?.name);
      if (key && value && !map.has(key)) map.set(key, value);
    }
  }

  if (serviceProperties) {
    for (const [key, value] of Object.entries(serviceProperties)) {
      const normalizedKey = getStringValue(key).toLowerCase();
      const normalizedValue = getStringValue(value);
      if (normalizedKey && normalizedValue) map.set(normalizedKey, normalizedValue);
    }
  }

  return map;
}

function readProperty(map: Map<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = map.get(key.toLowerCase());
    if (value) return value;
  }

  return null;
}

function isoTimestamp() {
  return new Date().toISOString();
}

type PlanBaseline = {
  runtimeCpuLimit: string;
  runtimeMemoryLimit: string;
  storageSize: string;
  replicaLimit: number;
  domainLimit: number;
  envVarLimit: number;
  logRetentionLines: number;
};

function buildPlanBaseline(productSlug: string): PlanBaseline {
  switch (productSlug) {
    case 'app-team':
      return {
        runtimeCpuLimit: '4',
        runtimeMemoryLimit: '4Gi',
        storageSize: '40Gi',
        replicaLimit: 4,
        domainLimit: 10,
        envVarLimit: 64,
        logRetentionLines: 2000,
      };
    case 'app-pro':
      return {
        runtimeCpuLimit: '2',
        runtimeMemoryLimit: '2Gi',
        storageSize: '20Gi',
        replicaLimit: 2,
        domainLimit: 5,
        envVarLimit: 48,
        logRetentionLines: 1500,
      };
    case 'app-standard':
      return {
        runtimeCpuLimit: '1',
        runtimeMemoryLimit: '1Gi',
        storageSize: '10Gi',
        replicaLimit: 1,
        domainLimit: 2,
        envVarLimit: 32,
        logRetentionLines: 1000,
      };
    case 'app-starter':
    default:
      return {
        runtimeCpuLimit: '500m',
        runtimeMemoryLimit: '512Mi',
        storageSize: '5Gi',
        replicaLimit: 1,
        domainLimit: 1,
        envVarLimit: 24,
        logRetentionLines: 500,
      };
  }
}

function sanitizeTagSegment(input: string, fallback: string) {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);

  return normalized || fallback;
}

function buildImageRef(config: ManagedAppManagerConfig, serviceId: string, branch: string, buildTimestamp: string) {
  const repository = `${config.imageRepositoryPrefix.replace(/^\/+|\/+$/g, '')}/service-${serviceId}`;
  const tag = `${sanitizeTagSegment(branch, 'main')}-${buildTimestamp}`;
  const registryPrefix = config.imageRegistry ? `${config.imageRegistry.replace(/\/+$/, '')}/` : '';

  return {
    imageRef: `${registryPrefix}${repository}:${tag}`,
    imageTag: tag,
  };
}

function clampEnvVars(envVars: Record<string, string>, limit: number) {
  const entries = Object.entries(envVars);
  if (entries.length <= limit) {
    return envVars;
  }

  return Object.fromEntries(entries.slice(0, limit));
}

function buildNetworkPolicyEgressRules() {
  return [
    {
      to: [
        {
          namespaceSelector: {
            matchLabels: {
              'kubernetes.io/metadata.name': 'kube-system',
            },
          },
        },
      ],
      ports: [
        { protocol: 'UDP', port: 53 },
        { protocol: 'TCP', port: 53 },
      ],
    },
    {
      to: [
        {
          ipBlock: {
            cidr: '0.0.0.0/0',
          },
        },
      ],
    },
  ];
}

function findLatestConditionReason(conditions: unknown) {
  if (!Array.isArray(conditions)) {
    return null;
  }

  const sorted = [...conditions]
    .filter((entry) => typeof entry === 'object' && entry !== null)
    .map((entry) => entry as Record<string, unknown>)
    .sort((left, right) => {
      const leftTime = Date.parse(getStringValue(left.lastTransitionTime) || '1970-01-01T00:00:00Z');
      const rightTime = Date.parse(getStringValue(right.lastTransitionTime) || '1970-01-01T00:00:00Z');
      return rightTime - leftTime;
    });

  for (const condition of sorted) {
    const reason = getStringValue(condition.reason);
    if (reason) {
      return reason;
    }
  }

  return null;
}

function readBuildPhase(buildPods: Array<Record<string, unknown>>, previousStatus: string | null) {
  const buildPod = [...buildPods]
    .sort((left, right) => {
      const leftTime = Date.parse(getStringValue((left.metadata as Record<string, unknown> | undefined)?.creationTimestamp) || '1970-01-01T00:00:00Z');
      const rightTime = Date.parse(getStringValue((right.metadata as Record<string, unknown> | undefined)?.creationTimestamp) || '1970-01-01T00:00:00Z');
      return rightTime - leftTime;
    })[0];

  if (!buildPod) {
    return previousStatus === 'failed' ? 'retrying' : 'pending';
  }

  const status = typeof buildPod.status === 'object' && buildPod.status !== null
    ? buildPod.status as Record<string, unknown>
    : {};
  const initStatuses = Array.isArray(status.initContainerStatuses)
    ? status.initContainerStatuses as Array<Record<string, unknown>>
    : [];
  const containerStatuses = Array.isArray(status.containerStatuses)
    ? status.containerStatuses as Array<Record<string, unknown>>
    : [];

  const initRunning = initStatuses.some((entry) => typeof entry.state === 'object' && entry.state !== null && typeof (entry.state as Record<string, unknown>).running === 'object');
  const initWaiting = initStatuses.some((entry) => typeof entry.state === 'object' && entry.state !== null && typeof (entry.state as Record<string, unknown>).waiting === 'object');
  const buildRunning = containerStatuses.some((entry) => typeof entry.state === 'object' && entry.state !== null && typeof (entry.state as Record<string, unknown>).running === 'object');
  const buildWaiting = containerStatuses.some((entry) => typeof entry.state === 'object' && entry.state !== null && typeof (entry.state as Record<string, unknown>).waiting === 'object');

  if (previousStatus === 'failed' && (initRunning || initWaiting || buildRunning || buildWaiting)) {
    return 'retrying';
  }

  if (initRunning || initWaiting || buildWaiting) {
    return 'queued';
  }

  if (buildRunning) {
    return 'building';
  }

  return previousStatus === 'failed' ? 'retrying' : 'queued';
}

function buildSpec(
  config: ManagedAppManagerConfig,
  service: ServiceInput,
  options: {
    propertyMap?: Map<string, string>;
    productSettings?: Record<string, unknown>;
    serviceProperties?: Record<string, unknown>;
    overrideDomain?: string | null;
    overrideReplicas?: number;
    overrideEnv?: Record<string, string>;
  } = {},
): ManagedAppSpec {
  const propertyMap = buildPropertyMap(service, options.propertyMap, options.serviceProperties);
  const productSettings = options.productSettings ?? {};
  const serviceId = getStringValue(service.id) || '0';
  const baseLabel = getStringValue('label' in service ? service.label : '')
    || getStringValue('baseLabel' in service ? service.baseLabel : '')
    || getStringValue('base_label' in service ? service.base_label : '')
    || `app-${serviceId}`;
  const baseSlug = slugify(baseLabel, `app-${serviceId}`);
  const productSlug = getStringValue(service.product?.slug) || 'app-hosting';
  const planBaseline = buildPlanBaseline(productSlug);
  const namespace = readProperty(propertyMap, 'k8s_namespace') || `${config.namespacePrefix}-${serviceId}`;
  const workloadKind = (readProperty(propertyMap, 'workload_mode') || getStringValue(productSettings.workload_mode) || 'deployment').toLowerCase() === 'statefulset'
    ? 'StatefulSet'
    : 'Deployment';
  const workloadName = readProperty(propertyMap, 'k8s_workload') || baseSlug;
  const runtimePort = getNumberValue(readProperty(propertyMap, 'runtime_port') || productSettings.runtime_port, 3000);
  const replicaLimit = Math.max(1, getNumberValue(readProperty(propertyMap, 'replica_limit') || productSettings.replica_limit, planBaseline.replicaLimit));
  const desiredReplicas = Math.min(replicaLimit, Math.max(1, options.overrideReplicas ?? getNumberValue(readProperty(propertyMap, 'app_replicas'), 1)));
  const buildTimestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const { imageRef: defaultImageRef, imageTag } = buildImageRef(
    config,
    serviceId,
    getStringValue(readProperty(propertyMap, 'git_branch')) || 'main',
    buildTimestamp,
  );
  const domainLimit = Math.max(1, getNumberValue(readProperty(propertyMap, 'domain_limit') || productSettings.domain_limit, planBaseline.domainLimit));
  const envVarLimit = Math.max(1, getNumberValue(readProperty(propertyMap, 'env_var_limit') || productSettings.env_var_limit, planBaseline.envVarLimit));
  const logRetentionLines = Math.max(100, getNumberValue(readProperty(propertyMap, 'log_retention_lines') || productSettings.log_retention_lines, planBaseline.logRetentionLines));
  const envVars = clampEnvVars({
    PORT: String(runtimePort),
    ...parseEnvVars(readProperty(propertyMap, 'env_vars')),
    ...(options.overrideEnv ?? {}),
  }, envVarLimit);

  return {
    serviceId,
    serviceLabel: baseLabel,
    productSlug,
    runtimeRef: readProperty(propertyMap, 'runtime_ref') || `${namespace}/${workloadName}`,
    clusterRef: readProperty(propertyMap, 'k8s_cluster_ref') || config.defaultClusterRef,
    namespace,
    workloadName,
    workloadKind,
    serviceName: readProperty(propertyMap, 'k8s_service') || `${baseSlug}-svc`,
    ingressName: `${baseSlug}-ing`,
    envSecretName: `${baseSlug}-env`,
    pvcName: `${baseSlug}-data`,
    buildJobName: `${baseSlug}-build-${buildTimestamp.slice(-8)}`,
    imagePullSecretName: 'managed-app-registry',
    imageRef: readProperty(propertyMap, 'app_image_ref') || defaultImageRef,
    desiredReplicas,
    replicaLimit,
    runtimePort,
    storageSize: getStringValue(readProperty(propertyMap, 'persistent_storage_size') || productSettings.persistent_storage_size) || planBaseline.storageSize,
    gitRepoUrl: getStringValue(readProperty(propertyMap, 'git_repo_url')),
    gitBranch: getStringValue(readProperty(propertyMap, 'git_branch')) || 'main',
    gitContextDir: getStringValue(readProperty(propertyMap, 'git_context_dir')) || '.',
    dockerfilePath: getStringValue(readProperty(propertyMap, 'dockerfile_path')) || 'Dockerfile',
    domain: options.overrideDomain ?? readProperty(propertyMap, 'app_domain', 'initial_domain') ?? (config.defaultDomainSuffix ? `${baseSlug}-${serviceId}.${config.defaultDomainSuffix}` : null),
    ingressEnabled: getBooleanValue(readProperty(propertyMap, 'ingress_enabled') || productSettings.ingress_enabled, true),
    tlsEnabled: getBooleanValue(readProperty(propertyMap, 'tls_enabled') || productSettings.tls_enabled, true),
    envVars,
    buildNamespace: getStringValue(readProperty(propertyMap, 'managed_app_build_namespace')) || config.buildNamespace || namespace,
    buildTimestamp,
    runtimeCpuLimit: getStringValue(productSettings.runtime_cpu_limit) || planBaseline.runtimeCpuLimit,
    runtimeMemoryLimit: getStringValue(productSettings.runtime_memory_limit) || planBaseline.runtimeMemoryLimit,
    buildCpuLimit: getStringValue(productSettings.build_cpu_limit) || null,
    buildMemoryLimit: getStringValue(productSettings.build_memory_limit) || null,
    previousImageRef: readProperty(propertyMap, 'app_previous_image_ref'),
    domainLimit,
    envVarLimit,
    logRetentionLines,
    resourceQuotaName: `${baseSlug}-quota`,
    limitRangeName: `${baseSlug}-limits`,
    ingressPolicyName: `${baseSlug}-ingress-policy`,
    egressPolicyName: `${baseSlug}-egress-policy`,
    metadataConfigMapName: `${baseSlug}-meta`,
    imageTag,
  };
}

function buildRuntimeProperties(spec: ManagedAppSpec, snapshot: ManagedAppSnapshot) {
  return {
    runtime_kind: 'managed-app',
    runtime_ref: spec.runtimeRef,
    k8s_cluster_ref: spec.clusterRef,
    k8s_namespace: spec.namespace,
    k8s_workload: spec.workloadName,
    k8s_service: spec.serviceName,
    k8s_ingress_url: snapshot.runtime.managedApp?.ingressUrl ?? '',
    app_status: snapshot.runtime.status ?? '',
    app_endpoint: snapshot.runtime.endpoint ?? '',
    app_last_deploy_at: snapshot.runtime.lastDeployAt ?? '',
    app_domain: snapshot.runtime.domain ?? '',
    app_tls_status: snapshot.runtime.tlsStatus ?? '',
    app_replicas: snapshot.runtime.replicas !== null ? String(snapshot.runtime.replicas) : '',
    app_env_vars: snapshot.runtime.envJson ?? '',
    app_image_ref: spec.imageRef,
    app_previous_image_ref: spec.previousImageRef ?? '',
    app_image_tag: spec.imageTag,
    app_domain_limit: String(spec.domainLimit),
    app_env_var_limit: String(spec.envVarLimit),
    app_log_retention_lines: String(spec.logRetentionLines),
    app_build_job_name: spec.buildJobName,
  };
}

export function createManagedAppRuntimeManager(config: ManagedAppManagerConfig) {
  async function runKubectl(args: string[], stdin?: string) {
    if (!config.enabled) throw new ManagedAppRuntimeError('Managed App runtime is disabled.', 503, 'MANAGED_APP_DISABLED');
    if (config.driver === 'contract') throw new ManagedAppRuntimeError('Managed App runtime driver is contract-only.', 501, 'MANAGED_APP_CONTRACT_ONLY');

    const env = {
      ...process.env,
      ...(config.driver === 'kubeconfig' && config.kubeconfigPath ? { KUBECONFIG: config.kubeconfigPath } : {}),
    };

    return await new Promise<string>((resolve, reject) => {
      const child = spawn('kubectl', args, { env });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += String(chunk); });
      child.stderr.on('data', (chunk) => { stderr += String(chunk); });
      child.on('error', (error) => reject(new ManagedAppRuntimeError(`kubectl execution failed: ${error.message}`, 502, 'MANAGED_APP_KUBECTL_EXEC_FAILED')));
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
          return;
        }
        reject(new ManagedAppRuntimeError(stderr.trim() || 'kubectl command failed.', 502, 'MANAGED_APP_KUBECTL_FAILED', { args, stdout, stderr, code }));
      });
      if (stdin) child.stdin.write(stdin);
      child.stdin.end();
    });
  }

  async function kubectlJson(args: string[]) {
    const output = await runKubectl([...args, '-o', 'json']);
    return output ? JSON.parse(output) as Record<string, unknown> : null;
  }

  async function kubectlOptionalJson(args: string[]) {
    try {
      return await kubectlJson(args);
    } catch (error) {
      if (error instanceof ManagedAppRuntimeError && String(error.message).toLowerCase().includes('notfound')) return null;
      throw error;
    }
  }

  async function applyManifest(items: Record<string, unknown>[]) {
    await runKubectl(['apply', '-f', '-'], JSON.stringify({ apiVersion: 'v1', kind: 'List', items }));
  }

  async function ensureNamespace(namespace: string, labels: Record<string, string> = {}) {
    await applyManifest([{
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: namespace,
        labels: {
          'sloth.cloud/runtime-kind': 'managed-app',
          'sloth.cloud/managed-app-tenant': 'true',
          ...labels,
        },
      },
    }]);
  }

  async function ensureRegistrySecret(namespace: string, secretName: string) {
    if (!config.registryAuthJson) return;
    await applyManifest([{
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name: secretName, namespace },
      type: 'kubernetes.io/dockerconfigjson',
      stringData: { '.dockerconfigjson': config.registryAuthJson },
    }]);
  }

  function buildNamespaceSecurityResources(spec: ManagedAppSpec) {
    const labels = {
      'sloth.cloud/service-id': spec.serviceId,
      'sloth.cloud/runtime-kind': 'managed-app',
      'app.kubernetes.io/instance': spec.runtimeRef,
    };
    const podQuota = String(Math.max(spec.replicaLimit + 1, 2));

    return [
      {
        apiVersion: 'v1',
        kind: 'ResourceQuota',
        metadata: {
          name: spec.resourceQuotaName,
          namespace: spec.namespace,
          labels,
        },
        spec: {
          hard: {
            pods: podQuota,
            services: '2',
            secrets: '6',
            configmaps: '2',
            'count/ingresses.networking.k8s.io': String(spec.domainLimit),
            'count/persistentvolumeclaims': spec.storageSize ? '1' : '0',
            ...(spec.storageSize ? { 'requests.storage': spec.storageSize } : {}),
            ...(spec.runtimeCpuLimit ? { 'limits.cpu': spec.runtimeCpuLimit, 'requests.cpu': spec.runtimeCpuLimit } : {}),
            ...(spec.runtimeMemoryLimit ? { 'limits.memory': spec.runtimeMemoryLimit, 'requests.memory': spec.runtimeMemoryLimit } : {}),
          },
        },
      },
      {
        apiVersion: 'v1',
        kind: 'LimitRange',
        metadata: {
          name: spec.limitRangeName,
          namespace: spec.namespace,
          labels,
        },
        spec: {
          limits: [
            {
              type: 'Container',
              default: {
                ...(spec.runtimeCpuLimit ? { cpu: spec.runtimeCpuLimit } : {}),
                ...(spec.runtimeMemoryLimit ? { memory: spec.runtimeMemoryLimit } : {}),
              },
              defaultRequest: {
                ...(spec.runtimeCpuLimit ? { cpu: spec.runtimeCpuLimit } : {}),
                ...(spec.runtimeMemoryLimit ? { memory: spec.runtimeMemoryLimit } : {}),
              },
              min: {
                cpu: '50m',
                memory: '64Mi',
              },
            },
            ...(spec.storageSize ? [{
              type: 'PersistentVolumeClaim',
              max: {
                storage: spec.storageSize,
              },
              min: {
                storage: '1Gi',
              },
            }] : []),
          ],
        },
      },
      {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'NetworkPolicy',
        metadata: {
          name: spec.ingressPolicyName,
          namespace: spec.namespace,
          labels,
        },
        spec: {
          podSelector: {
            matchLabels: labels,
          },
          policyTypes: ['Ingress'],
          ingress: [{
            from: [
              {
                namespaceSelector: {},
              },
            ],
            ports: [{
              protocol: 'TCP',
              port: spec.runtimePort,
            }],
          }],
        },
      },
      {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'NetworkPolicy',
        metadata: {
          name: spec.egressPolicyName,
          namespace: spec.namespace,
          labels,
        },
        spec: {
          podSelector: {
            matchLabels: labels,
          },
          policyTypes: ['Egress'],
          egress: buildNetworkPolicyEgressRules(),
        },
      },
      {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: spec.metadataConfigMapName,
          namespace: spec.namespace,
          labels,
        },
        data: {
          service_id: spec.serviceId,
          product_slug: spec.productSlug,
          image_ref: spec.imageRef,
          image_tag: spec.imageTag,
          git_repo_url: spec.gitRepoUrl,
          git_branch: spec.gitBranch,
          git_context_dir: spec.gitContextDir,
          dockerfile_path: spec.dockerfilePath,
        },
      },
    ] as Record<string, unknown>[];
  }

  function buildBuildJob(spec: ManagedAppSpec) {
    const dockerfileDir = spec.dockerfilePath.includes('/') ? spec.dockerfilePath.slice(0, spec.dockerfilePath.lastIndexOf('/')) : '.';
    const dockerfileName = spec.dockerfilePath.includes('/') ? spec.dockerfilePath.slice(spec.dockerfilePath.lastIndexOf('/') + 1) : spec.dockerfilePath;
    const contextDir = spec.gitContextDir === '/' ? '.' : spec.gitContextDir;
    const cloneScript = `set -eu\nrm -rf /workspace/source\ngit clone --depth 1 --branch ${shQuote(spec.gitBranch)} ${shQuote(spec.gitRepoUrl)} /workspace/source`;
    const buildScript = `set -eu\nCONTEXT_PATH=/workspace/source\nif [ ${shQuote(contextDir)} != '.' ] && [ ${shQuote(contextDir)} != '' ]; then CONTEXT_PATH="/workspace/source/${contextDir}"; fi\nDOCKERFILE_DIR=/workspace/source/${dockerfileDir === '.' ? '' : dockerfileDir}\nbuildctl-daemonless.sh build --frontend dockerfile.v0 --local context="$CONTEXT_PATH" --local dockerfile="$DOCKERFILE_DIR" --opt filename=${shQuote(dockerfileName)} --output ${shQuote(`type=image,name=${spec.imageRef},push=true`)}`;

    return {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: {
        name: spec.buildJobName,
        namespace: spec.buildNamespace,
        labels: {
          'sloth.cloud/service-id': spec.serviceId,
          'sloth.cloud/component': 'build',
          'sloth.cloud/runtime-kind': 'managed-app',
        },
        annotations: {
          'sloth.cloud/build-phase': 'queued',
          'sloth.cloud/image-ref': spec.imageRef,
          'sloth.cloud/image-tag': spec.imageTag,
        },
      },
      spec: {
        backoffLimit: 0,
        activeDeadlineSeconds: 3600,
        ttlSecondsAfterFinished: 3600,
        template: {
          metadata: {
            labels: {
              'sloth.cloud/service-id': spec.serviceId,
              'sloth.cloud/component': 'build',
              'sloth.cloud/runtime-kind': 'managed-app',
            },
          },
          spec: {
            restartPolicy: 'Never',
            initContainers: [{
              name: 'git-clone',
              image: config.gitCloneImage,
              command: ['sh', '-lc', cloneScript],
              volumeMounts: [{ name: 'workspace', mountPath: '/workspace' }],
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: false,
              },
            }],
            containers: [{
              name: 'buildkit',
              image: config.buildkitImage,
              command: ['sh', '-lc', buildScript],
              env: [{ name: 'BUILDKITD_FLAGS', value: '--oci-worker-no-process-sandbox' }],
              volumeMounts: [
                { name: 'workspace', mountPath: '/workspace' },
                ...(config.registryAuthJson ? [{ name: 'docker-config', mountPath: '/home/user/.docker/config.json', subPath: '.dockerconfigjson' }] : []),
              ],
              resources: { limits: { ...(spec.buildCpuLimit ? { cpu: spec.buildCpuLimit } : {}), ...(spec.buildMemoryLimit ? { memory: spec.buildMemoryLimit } : {}) } },
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: false,
              },
            }],
            volumes: [
              { name: 'workspace', emptyDir: {} },
              ...(config.registryAuthJson ? [{ name: 'docker-config', secret: { secretName: spec.imagePullSecretName } }] : []),
            ],
          },
        },
      },
    };
  }

  function buildRuntimeResources(spec: ManagedAppSpec) {
    const labels = { 'sloth.cloud/service-id': spec.serviceId, 'sloth.cloud/runtime-kind': 'managed-app', 'app.kubernetes.io/name': spec.workloadName, 'app.kubernetes.io/instance': spec.runtimeRef };
    const deploymentVolumes = spec.workloadKind === 'Deployment' && spec.storageSize ? [{ name: 'data', persistentVolumeClaim: { claimName: spec.pvcName } }] : [];
    const deploymentVolumeMounts = spec.workloadKind === 'Deployment' && spec.storageSize ? [{ name: 'data', mountPath: '/data' }] : [];
    const workloadBase = {
      metadata: {
        name: spec.workloadName,
        namespace: spec.namespace,
        labels,
        annotations: {
          'sloth.cloud/last-deploy-at': isoTimestamp(),
          'sloth.cloud/image-ref': spec.imageRef,
          'sloth.cloud/image-tag': spec.imageTag,
          ...(spec.previousImageRef ? { 'sloth.cloud/previous-image-ref': spec.previousImageRef } : {}),
        },
      },
      spec: {
        revisionHistoryLimit: 5,
        ...(spec.workloadKind === 'StatefulSet' ? { serviceName: spec.serviceName } : {}),
        replicas: spec.desiredReplicas,
        selector: { matchLabels: labels },
        template: {
          metadata: {
            labels,
            annotations: {
              'sloth.cloud/last-deploy-at': isoTimestamp(),
              'sloth.cloud/image-ref': spec.imageRef,
            },
          },
          spec: {
            imagePullSecrets: config.registryAuthJson ? [{ name: spec.imagePullSecretName }] : [],
            containers: [{
              name: 'app',
              image: spec.imageRef,
              ports: [{ name: 'http', containerPort: spec.runtimePort }],
              envFrom: [{ secretRef: { name: spec.envSecretName } }],
              resources: { limits: { ...(spec.runtimeCpuLimit ? { cpu: spec.runtimeCpuLimit } : {}), ...(spec.runtimeMemoryLimit ? { memory: spec.runtimeMemoryLimit } : {}) } },
              volumeMounts: spec.workloadKind === 'StatefulSet' && spec.storageSize ? [{ name: 'data', mountPath: '/data' }] : deploymentVolumeMounts,
              securityContext: {
                allowPrivilegeEscalation: false,
                readOnlyRootFilesystem: false,
              },
            }],
            ...(deploymentVolumes.length > 0 ? { volumes: deploymentVolumes } : {}),
          },
        },
      },
    };

    return [
      { apiVersion: 'v1', kind: 'Secret', metadata: { name: spec.envSecretName, namespace: spec.namespace, labels }, type: 'Opaque', stringData: spec.envVars },
      ...(spec.workloadKind === 'Deployment' && spec.storageSize ? [{ apiVersion: 'v1', kind: 'PersistentVolumeClaim', metadata: { name: spec.pvcName, namespace: spec.namespace, labels }, spec: { accessModes: ['ReadWriteOnce'], ...(config.storageClass ? { storageClassName: config.storageClass } : {}), resources: { requests: { storage: spec.storageSize } } } }] : []),
      { apiVersion: 'v1', kind: 'Service', metadata: { name: spec.serviceName, namespace: spec.namespace, labels }, spec: { selector: labels, ports: [{ name: 'http', port: spec.runtimePort, targetPort: spec.runtimePort }] } },
      spec.workloadKind === 'StatefulSet'
        ? { apiVersion: 'apps/v1', kind: 'StatefulSet', ...workloadBase, spec: { ...workloadBase.spec, ...(spec.storageSize ? { volumeClaimTemplates: [{ metadata: { name: 'data' }, spec: { accessModes: ['ReadWriteOnce'], ...(config.storageClass ? { storageClassName: config.storageClass } : {}), resources: { requests: { storage: spec.storageSize } } } }] } : {}) } }
        : { apiVersion: 'apps/v1', kind: 'Deployment', ...workloadBase },
      ...(spec.ingressEnabled && spec.domain ? [{
        apiVersion: 'networking.k8s.io/v1',
        kind: 'Ingress',
        metadata: { name: spec.ingressName, namespace: spec.namespace, labels, annotations: { ...(config.ingressClass ? { 'kubernetes.io/ingress.class': config.ingressClass } : {}), ...(spec.tlsEnabled && config.certIssuer ? { 'cert-manager.io/cluster-issuer': config.certIssuer } : {}) } },
        spec: {
          ...(config.ingressClass ? { ingressClassName: config.ingressClass } : {}),
          rules: [{ host: spec.domain, http: { paths: [{ path: '/', pathType: 'Prefix', backend: { service: { name: spec.serviceName, port: { number: spec.runtimePort } } } }] } }],
          ...(spec.tlsEnabled ? { tls: [{ hosts: [spec.domain], secretName: `${spec.workloadName}-tls` }] } : {}),
        },
      }] : []),
    ] as Record<string, unknown>[];
  }

  async function readPods(spec: ManagedAppSpec) {
    const podsJson = await kubectlOptionalJson(['get', 'pods', '-n', spec.namespace, '-l', `sloth.cloud/service-id=${spec.serviceId}`]);
    return Array.isArray(podsJson?.items) ? podsJson.items as Array<Record<string, unknown>> : [];
  }

  async function readBuildPods(spec: ManagedAppSpec) {
    const podsJson = await kubectlOptionalJson(['get', 'pods', '-n', spec.buildNamespace, '-l', `sloth.cloud/service-id=${spec.serviceId},sloth.cloud/component=build`]);
    return Array.isArray(podsJson?.items) ? podsJson.items as Array<Record<string, unknown>> : [];
  }

  function detectPodError(pods: Array<Record<string, unknown>>) {
    for (const pod of pods) {
      const status = typeof pod.status === 'object' && pod.status !== null ? pod.status as Record<string, unknown> : {};
      const containers = Array.isArray(status.containerStatuses) ? status.containerStatuses as Array<Record<string, unknown>> : [];
      for (const container of containers) {
        const state = typeof container.state === 'object' && container.state !== null ? container.state as Record<string, unknown> : {};
        const waiting = typeof state.waiting === 'object' && state.waiting !== null ? state.waiting as Record<string, unknown> : {};
        const reason = getStringValue(waiting.reason);
        if (reason) return reason.toLowerCase();
      }
    }
    return null;
  }

  async function rollbackWorkload(spec: ManagedAppSpec, targetImage?: string | null) {
    if (targetImage) {
      await runKubectl(['set', 'image', `${spec.workloadKind.toLowerCase()}/${spec.workloadName}`, 'app=' + targetImage, '-n', spec.namespace]);
      return;
    }

    await runKubectl(['rollout', 'undo', `${spec.workloadKind.toLowerCase()}/${spec.workloadName}`, '-n', spec.namespace]);
  }

  async function snapshot(service: ServiceInput, options: { propertyMap?: Map<string, string>; productSettings?: Record<string, unknown>; serviceProperties?: Record<string, unknown> } = {}): Promise<ManagedAppSnapshot> {
    const spec = buildSpec(config, service, options);
    const namespaceJson = await kubectlOptionalJson(['get', 'namespace', spec.namespace]);
    if (!namespaceJson) {
      const previousStatus = getStringValue(options.serviceProperties?.app_status);
      const runtime: ManagedAppSnapshot['runtime'] = {
        kind: 'managed-app',
        contractVersion: '2026-04-pr4',
        runtimeRef: spec.runtimeRef,
        status: previousStatus || 'pending',
        endpoint: null,
        lastDeployAt: null,
        managedApp: { clusterRef: spec.clusterRef, namespace: spec.namespace, workload: spec.workloadName, service: spec.serviceName, ingressUrl: null },
        vps: null,
        domain: spec.domain,
        tlsStatus: spec.tlsEnabled ? 'pending' : 'disabled',
        replicas: null,
        envJson: JSON.stringify(spec.envVars),
      };
      return { runtime, properties: buildRuntimeProperties(spec, { runtime, properties: {} }) };
    }

    const workloadJson = await kubectlOptionalJson(['get', spec.workloadKind.toLowerCase(), spec.workloadName, '-n', spec.namespace]);
    const serviceJson = await kubectlOptionalJson(['get', 'service', spec.serviceName, '-n', spec.namespace]);
    const ingressJson = await kubectlOptionalJson(['get', 'ingress', spec.ingressName, '-n', spec.namespace]);
    const envSecret = await kubectlOptionalJson(['get', 'secret', spec.envSecretName, '-n', spec.namespace]);
    const jobsJson = await kubectlOptionalJson(['get', 'jobs', '-n', spec.buildNamespace, '-l', `sloth.cloud/service-id=${spec.serviceId},sloth.cloud/component=build`]);
    const pods = await readPods(spec);
    const buildPods = await readBuildPods(spec);

    const jobItems = Array.isArray(jobsJson?.items) ? jobsJson.items as Array<Record<string, unknown>> : [];
    const latestJob = [...jobItems].sort((left, right) => Date.parse(String((right.metadata as Record<string, unknown> | undefined)?.creationTimestamp ?? '0')) - Date.parse(String((left.metadata as Record<string, unknown> | undefined)?.creationTimestamp ?? '0')))[0];
    const jobStatus = latestJob && typeof latestJob.status === 'object' && latestJob.status !== null ? latestJob.status as Record<string, unknown> : {};
    const activeBuilds = getNumberValue(jobStatus.active, 0);
    const failedBuilds = getNumberValue(jobStatus.failed, 0);
    const succeededBuilds = getNumberValue(jobStatus.succeeded, 0);
    const readyReplicas = workloadJson && typeof workloadJson.status === 'object' && workloadJson.status !== null ? getNumberValue((workloadJson.status as Record<string, unknown>).readyReplicas, 0) : 0;
    const desiredReplicas = workloadJson && typeof workloadJson.spec === 'object' && workloadJson.spec !== null ? getNumberValue((workloadJson.spec as Record<string, unknown>).replicas, spec.desiredReplicas) : spec.desiredReplicas;
    const ingressHost = Array.isArray((ingressJson?.spec as Record<string, unknown> | undefined)?.rules) ? getStringValue((((ingressJson?.spec as Record<string, unknown>).rules as Array<Record<string, unknown>>)[0] ?? {}).host) : '';
    const tlsEntries = Array.isArray((ingressJson?.spec as Record<string, unknown> | undefined)?.tls) ? ((ingressJson?.spec as Record<string, unknown>).tls as Array<Record<string, unknown>>) : [];
    const envJson = envSecret && typeof envSecret.data === 'object' && envSecret.data !== null ? JSON.stringify(Object.fromEntries(Object.entries(envSecret.data as Record<string, unknown>).map(([key, value]) => [key, Buffer.from(String(value ?? ''), 'base64').toString('utf8')]))) : JSON.stringify(spec.envVars);
    const podError = detectPodError(pods);
    const previousStatus = getStringValue(options.serviceProperties?.app_status) || null;
    const lastWorkloadReason = findLatestConditionReason((workloadJson?.status as Record<string, unknown> | undefined)?.conditions);

    let status = 'pending';
    if (String((namespaceJson.metadata as Record<string, unknown> | undefined)?.deletionTimestamp ?? '') !== '') {
      status = 'deleting';
    } else if (failedBuilds > 0 || podError) {
      status = 'failed';
    } else if (activeBuilds > 0) {
      status = readBuildPhase(buildPods, previousStatus);
    } else if (succeededBuilds > 0 && !workloadJson) {
      status = 'pushing';
    } else if (workloadJson && desiredReplicas > 0 && readyReplicas < desiredReplicas) {
      status = 'deploying';
    } else if (desiredReplicas > 0 && readyReplicas >= desiredReplicas && readyReplicas > 0) {
      status = 'ready';
    } else if (latestJob) {
      status = succeededBuilds > 0 ? 'deploying' : 'queued';
    }

    const endpoint = ingressHost ? `${tlsEntries.length > 0 ? 'https' : 'http'}://${ingressHost}` : getStringValue((serviceJson?.spec as Record<string, unknown> | undefined)?.clusterIP) || null;
    const runtime: ManagedAppSnapshot['runtime'] = {
      kind: 'managed-app',
      contractVersion: '2026-04-pr4',
      runtimeRef: spec.runtimeRef,
      status,
      endpoint,
      lastDeployAt: getStringValue((workloadJson?.metadata as Record<string, unknown> | undefined)?.annotations ? ((workloadJson?.metadata as Record<string, unknown>).annotations as Record<string, unknown>)['sloth.cloud/last-deploy-at'] : null) || null,
      managedApp: { clusterRef: spec.clusterRef, namespace: spec.namespace, workload: spec.workloadName, service: spec.serviceName, ingressUrl: ingressHost ? endpoint : null },
      vps: null,
      domain: ingressHost || spec.domain,
      tlsStatus: tlsEntries.length > 0 ? 'enabled' : (spec.tlsEnabled ? 'pending' : 'disabled'),
      replicas: desiredReplicas,
      envJson,
    };

    return {
      runtime,
      properties: {
        ...buildRuntimeProperties(spec, { runtime, properties: {} }),
        ...(podError ? { app_status_reason: podError } : {}),
        ...(lastWorkloadReason ? { app_rollout_reason: lastWorkloadReason } : {}),
      },
    };
  }

  async function provision(service: ServiceInput, options: { propertyMap?: Map<string, string>; productSettings?: Record<string, unknown>; serviceProperties?: Record<string, unknown>; forceReprovision?: boolean } = {}) {
    const previousImageRef = getStringValue(options.serviceProperties?.app_image_ref) || null;
    const spec = buildSpec(config, service, {
      ...options,
      serviceProperties: {
        ...(options.serviceProperties ?? {}),
        ...(options.forceReprovision ? { app_previous_image_ref: previousImageRef ?? '' } : {}),
        app_image_ref: '',
      },
    });
    if (!spec.gitRepoUrl.startsWith('https://')) throw new ManagedAppRuntimeError('Only public HTTPS Git repositories are supported in v1.', 422, 'MANAGED_APP_GIT_REPO_INVALID');
    await ensureNamespace(spec.namespace, {
      'sloth.cloud/service-id': spec.serviceId,
      'sloth.cloud/runtime-ref': spec.runtimeRef,
    });
    await ensureRegistrySecret(spec.namespace, spec.imagePullSecretName);
    if (spec.buildNamespace !== spec.namespace) {
      await ensureNamespace(spec.buildNamespace, {
        'sloth.cloud/build-namespace': 'true',
      });
      await ensureRegistrySecret(spec.buildNamespace, spec.imagePullSecretName);
    }
    await applyManifest([...buildNamespaceSecurityResources(spec), ...buildRuntimeResources(spec)]);
    await applyManifest([buildBuildJob(spec)]);
    const current = await snapshot(service, {
      ...options,
      serviceProperties: {
        ...(options.serviceProperties ?? {}),
        runtime_ref: spec.runtimeRef,
        k8s_cluster_ref: spec.clusterRef,
        k8s_namespace: spec.namespace,
        k8s_workload: spec.workloadName,
        k8s_service: spec.serviceName,
        app_domain: spec.domain ?? '',
        app_image_ref: spec.imageRef,
        app_previous_image_ref: previousImageRef ?? '',
        app_status: previousImageRef ? 'retrying' : 'queued',
      },
    });
    return {
      message: 'Managed App runtime provisioned.',
      runtime: current.runtime,
      properties: {
        ...current.properties,
        app_domain: spec.domain ?? '',
        app_image_ref: spec.imageRef,
        app_previous_image_ref: previousImageRef ?? '',
      },
    };
  }

  async function reconcile(service: ServiceInput, options: { propertyMap?: Map<string, string>; productSettings?: Record<string, unknown>; serviceProperties?: Record<string, unknown> } = {}) {
    const current = await snapshot(service, options);
    return { message: 'Managed App runtime state reconciled.', runtime: current.runtime, properties: current.properties };
  }

  async function restart(service: ServiceInput, options: { propertyMap?: Map<string, string>; serviceProperties?: Record<string, unknown>; productSettings?: Record<string, unknown> } = {}) {
    const spec = buildSpec(config, service, options);
    await runKubectl(['rollout', 'restart', `${spec.workloadKind.toLowerCase()}/${spec.workloadName}`, '-n', spec.namespace]);
    const current = await snapshot(service, {
      ...options,
      serviceProperties: {
        ...(options.serviceProperties ?? {}),
        app_status: 'deploying',
      },
    });
    return { message: 'Managed App restart submitted.', runtime: current.runtime, properties: current.properties };
  }

  async function deleteRuntime(service: ServiceInput, options: { propertyMap?: Map<string, string>; serviceProperties?: Record<string, unknown>; productSettings?: Record<string, unknown> } = {}) {
    const spec = buildSpec(config, service, options);
    await runKubectl(['delete', 'namespace', spec.namespace, '--ignore-not-found=true', '--wait=false']);
    const runtime: ManagedAppSnapshot['runtime'] = { kind: 'managed-app', contractVersion: '2026-04-pr4', runtimeRef: spec.runtimeRef, status: 'deleting', endpoint: null, lastDeployAt: isoTimestamp(), managedApp: { clusterRef: spec.clusterRef, namespace: spec.namespace, workload: spec.workloadName, service: spec.serviceName, ingressUrl: null }, vps: null, domain: spec.domain, tlsStatus: spec.tlsEnabled ? 'pending' : 'disabled', replicas: null, envJson: JSON.stringify(spec.envVars) };
    return { message: 'Managed App deletion submitted.', runtime, properties: buildRuntimeProperties(spec, { runtime, properties: {} }) };
  }

  async function updateEnv(service: ServiceInput, env: Record<string, string>, options: { propertyMap?: Map<string, string>; serviceProperties?: Record<string, unknown>; productSettings?: Record<string, unknown> } = {}) {
    const spec = buildSpec(config, service, { ...options, overrideEnv: env });
    await ensureNamespace(spec.namespace);
    await applyManifest([{ apiVersion: 'v1', kind: 'Secret', metadata: { name: spec.envSecretName, namespace: spec.namespace }, type: 'Opaque', stringData: spec.envVars }]);
    await runKubectl(['rollout', 'restart', `${spec.workloadKind.toLowerCase()}/${spec.workloadName}`, '-n', spec.namespace]);
    const current = await snapshot(service, { ...options, serviceProperties: { ...(options.serviceProperties ?? {}), app_env_vars: JSON.stringify(spec.envVars), app_status: 'deploying' } });
    return { message: 'Managed App environment variables updated.', runtime: current.runtime, properties: current.properties };
  }

  async function updateDomain(service: ServiceInput, domain: string, options: { propertyMap?: Map<string, string>; serviceProperties?: Record<string, unknown>; productSettings?: Record<string, unknown> } = {}) {
    const spec = buildSpec(config, service, { ...options, overrideDomain: domain });
    await ensureNamespace(spec.namespace);
    await applyManifest(buildRuntimeResources(spec).filter((item) => item.kind === 'Ingress'));
    const current = await snapshot(service, { ...options, serviceProperties: { ...(options.serviceProperties ?? {}), app_domain: domain, app_status: 'deploying' } });
    return { message: 'Managed App domain updated.', runtime: current.runtime, properties: current.properties };
  }

  async function updateTls(service: ServiceInput, domain: string | null, options: { propertyMap?: Map<string, string>; serviceProperties?: Record<string, unknown>; productSettings?: Record<string, unknown> } = {}) {
    const spec = buildSpec(config, service, { ...options, overrideDomain: domain });
    if (!spec.domain) throw new ManagedAppRuntimeError('A domain is required before enabling HTTPS.', 422, 'MANAGED_APP_TLS_DOMAIN_REQUIRED');
    await ensureNamespace(spec.namespace);
    await applyManifest(buildRuntimeResources({ ...spec, tlsEnabled: true }).filter((item) => item.kind === 'Ingress'));
    const current = await snapshot(service, { ...options, serviceProperties: { ...(options.serviceProperties ?? {}), app_domain: spec.domain, app_status: 'deploying' } });
    return { message: 'Managed App HTTPS configuration updated.', runtime: current.runtime, properties: current.properties };
  }

  async function scale(service: ServiceInput, replicas: number, options: { propertyMap?: Map<string, string>; serviceProperties?: Record<string, unknown>; productSettings?: Record<string, unknown> } = {}) {
    const spec = buildSpec(config, service, { ...options, overrideReplicas: replicas });
    if (replicas > spec.replicaLimit) throw new ManagedAppRuntimeError(`Replica count exceeds the plan limit (${spec.replicaLimit}).`, 422, 'MANAGED_APP_SCALE_LIMIT_EXCEEDED', { replicaLimit: spec.replicaLimit });
    await runKubectl(['scale', `${spec.workloadKind.toLowerCase()}/${spec.workloadName}`, '-n', spec.namespace, `--replicas=${replicas}`]);
    const current = await snapshot(service, { ...options, serviceProperties: { ...(options.serviceProperties ?? {}), app_replicas: String(replicas), app_status: 'deploying' } });
    return { message: 'Managed App scale updated.', runtime: current.runtime, properties: current.properties };
  }

  async function logs(service: ServiceInput, limit: number, options: { propertyMap?: Map<string, string>; serviceProperties?: Record<string, unknown>; productSettings?: Record<string, unknown> } = {}) {
    const spec = buildSpec(config, service, options);
    const pods = await readPods(spec);
    const podName = pods.map((pod) => getStringValue((pod.metadata as Record<string, unknown> | undefined)?.name)).find((entry) => entry !== '');
    if (!podName) return { message: 'No application logs are available yet.', data: { serviceId: spec.serviceId, runtimeKind: 'managed-app', podName: null, logs: [] as Array<{ line: string }> } };
    const rawLogs = await runKubectl(['logs', podName, '-n', spec.namespace, '--all-containers=true', `--tail=${Math.max(1, limit)}`]);
    return { message: 'Managed App logs fetched successfully.', data: { serviceId: spec.serviceId, runtimeKind: 'managed-app', podName, logs: rawLogs.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-spec.logRetentionLines).map((line) => ({ line })) } };
  }

  async function rollback(service: ServiceInput, options: { propertyMap?: Map<string, string>; serviceProperties?: Record<string, unknown>; productSettings?: Record<string, unknown>; targetImage?: string | null } = {}) {
    const spec = buildSpec(config, service, options);
    await rollbackWorkload(spec, options.targetImage ?? spec.previousImageRef);
    const current = await snapshot(service, {
      ...options,
      serviceProperties: {
        ...(options.serviceProperties ?? {}),
        app_status: 'deploying',
      },
    });
    return { message: 'Managed App rollback submitted.', runtime: current.runtime, properties: current.properties };
  }

  return { errorClass: ManagedAppRuntimeError, snapshot, provision, reconcile, restart, deleteRuntime, updateEnv, updateDomain, updateTls, scale, logs, rollback };
}

export { ManagedAppRuntimeError, buildPropertyMap, buildSpec, getStringValue, isoTimestamp, readProperty, shQuote };
export type { ManagedAppManagerConfig, ManagedAppSnapshot, ManagedAppSpec, ServiceInput };
