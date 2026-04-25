// @ts-nocheck
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { posix as pathPosix } from 'node:path';
import { parse as parseYaml } from 'yaml';
class ManagedAppRuntimeError extends Error {
    statusCode;
    code;
    detail;
    constructor(message, statusCode = 500, code = 'MANAGED_APP_RUNTIME_ERROR', detail) {
        super(message);
        this.name = 'ManagedAppRuntimeError';
        this.statusCode = statusCode;
        this.code = code;
        this.detail = detail;
    }
}
function getStringValue(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function getNumberValue(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function getBooleanValue(value, fallback = false) {
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'number')
        return value > 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(normalized))
            return true;
        if (['0', 'false', 'no', 'off'].includes(normalized))
            return false;
    }
    return fallback;
}
function slugify(input, fallback) {
    const normalized = input
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 32);
    return normalized || fallback;
}
function parseGitHubRepo(input) {
    const value = getStringValue(input).replace(/\/+$/, '');
    if (!value) {
        return null;
    }
    const match = value.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i);
    if (!match) {
        return null;
    }
    return {
        owner: match[1],
        repo: match[2],
    };
}
function parseSourceUrl(input) {
    const value = getStringValue(input);
    if (!value) {
        return null;
    }
    try {
        return new URL(value);
    }
    catch {
        return null;
    }
}
function isArchiveSourceUrl(input) {
    const parsed = parseSourceUrl(input);
    if (!parsed) {
        return false;
    }
    return parsed.pathname.endsWith('.tar.gz')
        || parsed.pathname.endsWith('.tgz')
        || parsed.pathname.endsWith('.tar');
}
function encodeGitHubPath(path) {
    return path
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
}
function normalizeRepoRelativePath(input, fallback = '.') {
    const normalizedInput = getStringValue(input).replace(/\\/g, '/');
    if (!normalizedInput) {
        return fallback;
    }
    if (normalizedInput.startsWith('/')) {
        throw new ManagedAppRuntimeError('Compose path must be relative to the repository root.', 422, 'MANAGED_APP_COMPOSE_PATH_ABSOLUTE');
    }
    const normalized = pathPosix.normalize(normalizedInput).replace(/^\.\/+/, '');
    if (!normalized || normalized === '.') {
        return fallback;
    }
    if (normalized.startsWith('..')) {
        throw new ManagedAppRuntimeError('Compose path must stay inside the repository.', 422, 'MANAGED_APP_COMPOSE_PATH_TRAVERSAL');
    }
    return normalized;
}
function parseComposeEnvironment(rawValue) {
    const map = {};
    if (Array.isArray(rawValue)) {
        for (const entry of rawValue) {
            const value = getStringValue(entry);
            if (!value) {
                continue;
            }
            const separatorIndex = value.indexOf('=');
            if (separatorIndex === -1) {
                map[value] = '';
                continue;
            }
            const key = value.slice(0, separatorIndex).trim();
            if (!key) {
                continue;
            }
            map[key] = value.slice(separatorIndex + 1);
        }
        return map;
    }
    if (typeof rawValue === 'object' && rawValue !== null) {
        for (const [key, value] of Object.entries(rawValue)) {
            const normalizedKey = getStringValue(key);
            if (!normalizedKey) {
                continue;
            }
            map[normalizedKey] = getStringValue(value);
        }
    }
    return map;
}
function parseComposePortEntry(rawValue) {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue > 0) {
        return Math.round(rawValue);
    }
    if (typeof rawValue === 'object' && rawValue !== null) {
        const target = getNumberValue(rawValue.target, NaN);
        if (Number.isFinite(target) && target > 0) {
            return Math.round(target);
        }
        return null;
    }
    const value = getStringValue(rawValue);
    if (!value) {
        return null;
    }
    const normalized = value.split('/')[0] ?? '';
    const segments = normalized
        .split(':')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '');
    if (segments.length === 0) {
        return null;
    }
    const containerPortRaw = segments[segments.length - 1] ?? '';
    const containerPort = Number(containerPortRaw);
    if (!Number.isFinite(containerPort) || containerPort <= 0) {
        return null;
    }
    return Math.round(containerPort);
}
function pickComposeRuntimePort(ports) {
    if (!Array.isArray(ports)) {
        return null;
    }
    for (const entry of ports) {
        const port = parseComposePortEntry(entry);
        if (port && port > 0) {
            return port;
        }
    }
    return null;
}
function shQuote(value) {
    return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}
function parseEnvVars(rawValue) {
    if (typeof rawValue === 'object' && rawValue !== null && !Array.isArray(rawValue)) {
        return Object.fromEntries(Object.entries(rawValue).map(([key, value]) => [key, String(value ?? '')]));
    }
    const value = getStringValue(rawValue);
    if (!value)
        return {};
    try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            return Object.fromEntries(Object.entries(parsed).map(([key, entry]) => [key, String(entry ?? '')]));
        }
    }
    catch {
        return {};
    }
    return {};
}
function buildPropertyMap(service, propertyMap, serviceProperties) {
    const map = new Map();
    if (propertyMap) {
        for (const [key, value] of propertyMap.entries()) {
            if (key && value)
                map.set(key.toLowerCase(), value);
        }
    }
    if ('properties' in service && Array.isArray(service.properties)) {
        for (const property of service.properties) {
            const key = getStringValue(property?.key).toLowerCase();
            const value = getStringValue(property?.value);
            if (key && value)
                map.set(key, value);
        }
    }
    if ('configs' in service && Array.isArray(service.configs)) {
        for (const entry of service.configs) {
            const key = getStringValue(entry.option?.envVariable).toLowerCase();
            const value = getStringValue(entry.value?.envVariable) || getStringValue(entry.value?.name);
            if (key && value && !map.has(key))
                map.set(key, value);
        }
    }
    if (serviceProperties) {
        for (const [key, value] of Object.entries(serviceProperties)) {
            const normalizedKey = getStringValue(key).toLowerCase();
            const normalizedValue = getStringValue(value);
            if (!normalizedKey) {
                continue;
            }
            // Allow explicit empty-string overrides to clear stale properties that are
            // persisted on the service (for example app_image_ref during reprovision).
            if (normalizedValue === '') {
                map.delete(normalizedKey);
                continue;
            }
            map.set(normalizedKey, normalizedValue);
        }
    }
    return map;
}
function readProperty(map, ...keys) {
    for (const key of keys) {
        const value = map.get(key.toLowerCase());
        if (value)
            return value;
    }
    return null;
}
function isoTimestamp() {
    return new Date().toISOString();
}
function validateKubeconfig(config) {
    if (config.driver !== 'kubeconfig') {
        return;
    }
    const kubeconfigPath = getStringValue(config.kubeconfigPath);
    if (!kubeconfigPath) {
        throw new ManagedAppRuntimeError('Managed App kubeconfig path is not configured.', 503, 'MANAGED_APP_KUBECONFIG_PATH_MISSING');
    }
    if (!existsSync(kubeconfigPath)) {
        throw new ManagedAppRuntimeError(`Managed App kubeconfig is missing at ${kubeconfigPath}. Mount the cluster kubeconfig to this path and restart sloth-cloud-api.`, 503, 'MANAGED_APP_KUBECONFIG_MISSING', { path: kubeconfigPath });
    }
    const kubeconfig = readFileSync(kubeconfigPath, 'utf8');
    const server = kubeconfig.match(/^\s*server:\s*(\S+)/m)?.[1] ?? null;
    if (server && /https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(server)) {
        throw new ManagedAppRuntimeError(`Managed App kubeconfig points to ${server}. Replace it with a cluster-reachable API endpoint such as https://192.168.16.220:6443.`, 503, 'MANAGED_APP_KUBECONFIG_LOOPBACK', { path: kubeconfigPath, server });
    }
}
function buildPlanBaseline(productSlug) {
    switch (productSlug) {
        case 'app-team':
            return {
                runtimeCpuLimit: '4',
                runtimeMemoryLimit: '4Gi',
                buildCpuLimit: '2',
                buildMemoryLimit: '4Gi',
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
                buildCpuLimit: '1500m',
                buildMemoryLimit: '3Gi',
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
                buildCpuLimit: '1',
                buildMemoryLimit: '2Gi',
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
                buildCpuLimit: '750m',
                buildMemoryLimit: '1Gi',
                storageSize: '5Gi',
                replicaLimit: 1,
                domainLimit: 1,
                envVarLimit: 24,
                logRetentionLines: 500,
            };
    }
}
function sanitizeTagSegment(input, fallback) {
    const normalized = input
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 32);
    return normalized || fallback;
}
function buildManagedAppAutoDomain(serviceId, suffix) {
    const normalizedSuffix = getStringValue(suffix).replace(/^\.+|\.+$/g, '');
    if (!normalizedSuffix) {
        return null;
    }
    return `app-${serviceId}.${normalizedSuffix}`;
}
function normalizeBuildkitRootPath(input) {
    const normalized = getStringValue(input);
    if (!normalized.startsWith('/')) {
        return '/var/lib/buildkit';
    }
    return normalized.replace(/\/+$/g, '') || '/var/lib/buildkit';
}
function sanitizeKubernetesLabelValue(input, fallback) {
    const normalized = input
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 63);
    const trimmed = normalized.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    return trimmed || fallback;
}
function deriveCpuRequest(limit) {
    const normalized = getStringValue(limit).toLowerCase();
    if (!normalized) {
        return '100m';
    }
    if (normalized.endsWith('m')) {
        const milli = Number(normalized.slice(0, -1));
        if (Number.isFinite(milli) && milli > 0) {
            return `${Math.max(100, Math.round(milli * 0.25))}m`;
        }
    }
    const cores = Number(normalized);
    if (Number.isFinite(cores) && cores > 0) {
        return `${Math.max(100, Math.round(cores * 1000 * 0.25))}m`;
    }
    return '100m';
}
function deriveMemoryRequest(limit) {
    const normalized = getStringValue(limit);
    if (!normalized) {
        return '128Mi';
    }
    const match = normalized.match(/^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti)?$/i);
    if (!match) {
        return '128Mi';
    }
    const value = Number(match[1]);
    const unit = (match[2] || 'Mi').toLowerCase();
    if (!Number.isFinite(value) || value <= 0) {
        return '128Mi';
    }
    const unitMultiplier = {
        ki: 1 / 1024,
        mi: 1,
        gi: 1024,
        ti: 1024 * 1024,
    };
    const limitMi = value * (unitMultiplier[unit] ?? 1);
    const requestMi = Math.max(128, Math.round(limitMi * 0.25));
    return `${requestMi}Mi`;
}
function buildImageRef(config, serviceId, branch, buildTimestamp) {
    const repository = `${config.imageRepositoryPrefix.replace(/^\/+|\/+$/g, '')}/service-${serviceId}`;
    const tag = `${sanitizeTagSegment(branch, 'main')}-${buildTimestamp}`;
    const registryPrefix = config.imageRegistry ? `${config.imageRegistry.replace(/\/+$/, '')}/` : '';
    return {
        imageRef: `${registryPrefix}${repository}:${tag}`,
        imageTag: tag,
    };
}
function extractImageTag(imageRef) {
    const normalized = getStringValue(imageRef);
    if (!normalized) {
        return null;
    }
    const lastColon = normalized.lastIndexOf(':');
    const lastSlash = normalized.lastIndexOf('/');
    if (lastColon <= lastSlash) {
        return null;
    }
    const tag = normalized.slice(lastColon + 1).trim();
    return tag || null;
}
function clampEnvVars(envVars, limit) {
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
function parseProxyHost(value) {
    const normalized = getStringValue(value);
    if (!normalized) {
        return null;
    }
    try {
        const parsed = new URL(normalized.includes('://') ? normalized : `http://${normalized}`);
        return parsed.hostname.toLowerCase();
    }
    catch {
        return null;
    }
}
function normalizeRegistryHost(value) {
    const normalized = getStringValue(value);
    if (!normalized) {
        return '';
    }
    return normalized
        .replace(/^https?:\/\//i, '')
        .replace(/\/+$/, '')
        .split('/')[0] ?? '';
}
function isLocalProxyHost(hostname) {
    if (!hostname) {
        return false;
    }
    return hostname === 'localhost'
        || hostname === '127.0.0.1'
        || hostname === '::1'
        || hostname === 'host.docker.internal';
}
function readKubeApiHostFromConfig(path) {
    const kubeconfigPath = getStringValue(path);
    if (!kubeconfigPath || !existsSync(kubeconfigPath)) {
        return null;
    }
    try {
        const content = readFileSync(kubeconfigPath, 'utf8');
        const server = content.match(/^\s*server:\s*(\S+)/m)?.[1] ?? '';
        const host = parseProxyHost(server);
        return host;
    }
    catch {
        return null;
    }
}
function normalizeNoProxyValue(value) {
    return value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}
function buildForwardProxyEnv() {
    const env = [];
    const noProxySet = new Set();
    const explicitHttpProxy = getStringValue(process.env.MANAGED_APP_BUILD_HTTP_PROXY);
    const explicitHttpsProxy = getStringValue(process.env.MANAGED_APP_BUILD_HTTPS_PROXY);
    const explicitNoProxy = getStringValue(process.env.MANAGED_APP_BUILD_NO_PROXY);
    const hasExplicitProxy = Boolean(explicitHttpProxy || explicitHttpsProxy || explicitNoProxy);
    const forwardProxy = hasExplicitProxy || getBooleanValue(process.env.MANAGED_APP_BUILD_FORWARD_PROXY, false);
    if (!forwardProxy) {
        return [];
    }
    const proxyKeys = ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy'];
    const registryHost = parseProxyHost(getStringValue(process.env.MANAGED_APP_IMAGE_REGISTRY));
    if (registryHost) {
        noProxySet.add(registryHost);
    }
    const kubeApiHost = readKubeApiHostFromConfig(process.env.MANAGED_APP_KUBECONFIG_PATH);
    if (kubeApiHost) {
        noProxySet.add(kubeApiHost);
    }
    for (const host of ['localhost', '127.0.0.1', '::1', 'kubernetes.default.svc', 'kubernetes.default.svc.cluster.local']) {
        noProxySet.add(host);
    }
    if (hasExplicitProxy) {
        const pairs = [
            { key: 'HTTP_PROXY', value: explicitHttpProxy },
            { key: 'http_proxy', value: explicitHttpProxy },
            { key: 'HTTPS_PROXY', value: explicitHttpsProxy || explicitHttpProxy },
            { key: 'https_proxy', value: explicitHttpsProxy || explicitHttpProxy },
        ];
        for (const pair of pairs) {
            if (!pair.value) {
                continue;
            }
            if (isLocalProxyHost(parseProxyHost(pair.value))) {
                continue;
            }
            env.push({ name: pair.key, value: pair.value });
        }
        for (const item of normalizeNoProxyValue(explicitNoProxy)) {
            noProxySet.add(item);
        }
    }
    for (const key of proxyKeys) {
        if (hasExplicitProxy) {
            continue;
        }
        const value = getStringValue(process.env[key]);
        if (!value) {
            continue;
        }
        if (key.toLowerCase().includes('proxy') && !key.toLowerCase().includes('no_proxy')) {
            if (isLocalProxyHost(parseProxyHost(value))) {
                continue;
            }
            env.push({ name: key, value });
            continue;
        }
        for (const item of normalizeNoProxyValue(value)) {
            noProxySet.add(item);
        }
    }
    const mergedNoProxy = Array.from(noProxySet).join(',');
    if (mergedNoProxy) {
        env.push({ name: 'NO_PROXY', value: mergedNoProxy });
        env.push({ name: 'no_proxy', value: mergedNoProxy });
    }
    return env;
}
function findLatestConditionReason(conditions) {
    if (!Array.isArray(conditions)) {
        return null;
    }
    const sorted = [...conditions]
        .filter((entry) => typeof entry === 'object' && entry !== null)
        .map((entry) => entry)
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
function readBuildPhase(buildPods, previousStatus) {
    const buildPod = [...buildPods]
        .sort((left, right) => {
        const leftTime = Date.parse(getStringValue(left.metadata?.creationTimestamp) || '1970-01-01T00:00:00Z');
        const rightTime = Date.parse(getStringValue(right.metadata?.creationTimestamp) || '1970-01-01T00:00:00Z');
        return rightTime - leftTime;
    })[0];
    if (!buildPod) {
        return previousStatus === 'failed' ? 'retrying' : 'pending';
    }
    const status = typeof buildPod.status === 'object' && buildPod.status !== null
        ? buildPod.status
        : {};
    const initStatuses = Array.isArray(status.initContainerStatuses)
        ? status.initContainerStatuses
        : [];
    const containerStatuses = Array.isArray(status.containerStatuses)
        ? status.containerStatuses
        : [];
    const initRunning = initStatuses.some((entry) => typeof entry.state === 'object' && entry.state !== null && typeof entry.state.running === 'object');
    const initWaiting = initStatuses.some((entry) => typeof entry.state === 'object' && entry.state !== null && typeof entry.state.waiting === 'object');
    const buildRunning = containerStatuses.some((entry) => typeof entry.state === 'object' && entry.state !== null && typeof entry.state.running === 'object');
    const buildWaiting = containerStatuses.some((entry) => typeof entry.state === 'object' && entry.state !== null && typeof entry.state.waiting === 'object');
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
async function resolveComposeLiteServiceFromGithub(spec) {
    const parsedRepo = parseGitHubRepo(spec.gitRepoUrl);
    const explicitComposePath = getStringValue(spec.composeFilePath);
    if (!explicitComposePath) {
        return null;
    }
    if (!parsedRepo) {
        throw new ManagedAppRuntimeError('Compose mode currently supports public GitHub repositories only. Disable compose mode or switch to a GitHub repository URL.', 422, 'MANAGED_APP_COMPOSE_GITHUB_ONLY');
    }
    const candidates = [normalizeRepoRelativePath(explicitComposePath)];
    const seen = new Set();
    const orderedCandidates = candidates.filter((entry) => {
        const key = entry.toLowerCase();
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    let composePath = null;
    let composeContent = null;
    let lastHttpStatus = null;
    try {
        for (const candidate of orderedCandidates) {
            const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(parsedRepo.owner)}/${encodeURIComponent(parsedRepo.repo)}/${encodeURIComponent(spec.gitBranch)}/${encodeGitHubPath(candidate)}`;
            const response = await fetch(rawUrl, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    Accept: 'text/plain',
                    'User-Agent': 'SlothCloud-ManagedApp/compose-lite',
                },
            });
            lastHttpStatus = response.status;
            if (response.status === 404) {
                continue;
            }
            if (!response.ok) {
                throw new ManagedAppRuntimeError(`Failed to read compose file from GitHub (HTTP ${response.status}).`, 502, 'MANAGED_APP_COMPOSE_FETCH_FAILED', { composePath: candidate, status: response.status });
            }
            composePath = candidate;
            composeContent = await response.text();
            break;
        }
    }
    catch (error) {
        if (error instanceof ManagedAppRuntimeError) {
            throw error;
        }
        throw new ManagedAppRuntimeError(`Failed to fetch compose file from GitHub: ${error instanceof Error ? error.message : String(error)}`, 502, 'MANAGED_APP_COMPOSE_FETCH_FAILED', { composePath: explicitComposePath || null });
    }
    finally {
        clearTimeout(timeout);
    }
    if (!composePath || !composeContent) {
        throw new ManagedAppRuntimeError(`Compose file not found at "${explicitComposePath}" on branch "${spec.gitBranch}".`, 422, 'MANAGED_APP_COMPOSE_FILE_NOT_FOUND', { composePath: explicitComposePath, status: lastHttpStatus });
    }
    let parsedCompose;
    try {
        parsedCompose = parseYaml(composeContent);
    }
    catch (error) {
        throw new ManagedAppRuntimeError(`Compose file "${composePath}" is not valid YAML.`, 422, 'MANAGED_APP_COMPOSE_INVALID_YAML', { composePath, error: error instanceof Error ? error.message : String(error) });
    }
    if (typeof parsedCompose !== 'object' || parsedCompose === null || Array.isArray(parsedCompose)) {
        throw new ManagedAppRuntimeError(`Compose file "${composePath}" must define an object root with "services".`, 422, 'MANAGED_APP_COMPOSE_INVALID_FORMAT', { composePath });
    }
    const servicesRaw = parsedCompose.services;
    if (typeof servicesRaw !== 'object' || servicesRaw === null || Array.isArray(servicesRaw)) {
        throw new ManagedAppRuntimeError(`Compose file "${composePath}" does not define any services.`, 422, 'MANAGED_APP_COMPOSE_SERVICES_MISSING', { composePath });
    }
    const services = Object.entries(servicesRaw)
        .filter(([, definition]) => typeof definition === 'object' && definition !== null && !Array.isArray(definition))
        .map(([name, definition]) => [name, definition]);
    if (services.length === 0) {
        throw new ManagedAppRuntimeError(`Compose file "${composePath}" does not contain usable service definitions.`, 422, 'MANAGED_APP_COMPOSE_SERVICES_EMPTY', { composePath });
    }
    const requestedService = getStringValue(spec.composeServiceName);
    const selectedService = requestedService
        ? services.find(([name]) => name === requestedService) ?? null
        : services.find(([, definition]) => definition.build !== undefined) ?? services[0];
    if (!selectedService) {
        throw new ManagedAppRuntimeError(`Compose service "${requestedService}" was not found in "${composePath}".`, 422, 'MANAGED_APP_COMPOSE_SERVICE_NOT_FOUND', { composePath, composeServiceName: requestedService });
    }
    const [composeServiceName, serviceDefinition] = selectedService;
    const buildDefinition = serviceDefinition.build;
    let buildContext = '.';
    let dockerfilePath = 'Dockerfile';
    if (typeof buildDefinition === 'string') {
        buildContext = getStringValue(buildDefinition) || '.';
    }
    else if (typeof buildDefinition === 'object' && buildDefinition !== null && !Array.isArray(buildDefinition)) {
        buildContext = getStringValue(buildDefinition.context) || '.';
        dockerfilePath = getStringValue(buildDefinition.dockerfile) || 'Dockerfile';
    }
    else {
        throw new ManagedAppRuntimeError(`Compose service "${composeServiceName}" must define "build" for managed app deployment.`, 422, 'MANAGED_APP_COMPOSE_BUILD_REQUIRED', { composePath, composeServiceName });
    }
    const composeDir = pathPosix.dirname(composePath);
    const resolvedContextDir = normalizeRepoRelativePath(pathPosix.join(composeDir, buildContext), '.');
    if (dockerfilePath.startsWith('/')) {
        throw new ManagedAppRuntimeError(`Compose service "${composeServiceName}" uses an absolute dockerfile path, which is not supported.`, 422, 'MANAGED_APP_COMPOSE_DOCKERFILE_ABSOLUTE', { composePath, composeServiceName, dockerfilePath });
    }
    const resolvedDockerfilePath = normalizeRepoRelativePath(pathPosix.join(resolvedContextDir, dockerfilePath), 'Dockerfile');
    return {
        composeFilePath: composePath,
        composeServiceName,
        gitContextDir: resolvedContextDir,
        dockerfilePath: resolvedDockerfilePath,
        runtimePort: pickComposeRuntimePort(serviceDefinition.ports),
        envVars: parseComposeEnvironment(serviceDefinition.environment),
    };
}
async function resolveProvisioningSpecWithCompose(spec) {
    const resolved = await resolveComposeLiteServiceFromGithub(spec);
    if (!resolved) {
        return spec;
    }
    const runtimePort = resolved.runtimePort && resolved.runtimePort > 0
        ? resolved.runtimePort
        : spec.runtimePort;
    const mergedEnv = clampEnvVars({
        ...resolved.envVars,
        ...spec.envVars,
        PORT: String(runtimePort),
    }, spec.envVarLimit);
    return {
        ...spec,
        composeFilePath: resolved.composeFilePath,
        composeServiceName: resolved.composeServiceName,
        gitContextDir: resolved.gitContextDir,
        dockerfilePath: resolved.dockerfilePath,
        runtimePort,
        envVars: mergedEnv,
    };
}
function buildSpec(config, service, options = {}) {
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
    const { imageRef: defaultImageRef, imageTag: defaultImageTag } = buildImageRef(config, serviceId, getStringValue(readProperty(propertyMap, 'git_branch')) || 'main', buildTimestamp);
    const persistedImageRef = readProperty(propertyMap, 'app_image_ref');
    const imageRef = persistedImageRef || defaultImageRef;
    const imageTag = extractImageTag(persistedImageRef) || defaultImageTag;
    const generatedBuildJobName = `${baseSlug}-build-${buildTimestamp.slice(-8)}`;
    const domainLimit = Math.max(1, getNumberValue(readProperty(propertyMap, 'domain_limit') || productSettings.domain_limit, planBaseline.domainLimit));
    const envVarLimit = Math.max(1, getNumberValue(readProperty(propertyMap, 'env_var_limit') || productSettings.env_var_limit, planBaseline.envVarLimit));
    const logRetentionLines = Math.max(100, getNumberValue(readProperty(propertyMap, 'log_retention_lines') || productSettings.log_retention_lines, planBaseline.logRetentionLines));
    const runtimeCpuLimit = getStringValue(productSettings.runtime_cpu_limit) || planBaseline.runtimeCpuLimit;
    const runtimeMemoryLimit = getStringValue(productSettings.runtime_memory_limit) || planBaseline.runtimeMemoryLimit;
    const runtimeCpuRequest = getStringValue(readProperty(propertyMap, 'runtime_cpu_request') || productSettings.runtime_cpu_request) || deriveCpuRequest(runtimeCpuLimit);
    const runtimeMemoryRequest = getStringValue(readProperty(propertyMap, 'runtime_memory_request') || productSettings.runtime_memory_request) || deriveMemoryRequest(runtimeMemoryLimit);
    const envVars = clampEnvVars({
        PORT: String(runtimePort),
        ...parseEnvVars(readProperty(propertyMap, 'env_vars')),
        ...(options.overrideEnv ?? {}),
    }, envVarLimit);
    const composeFilePath = getStringValue(readProperty(propertyMap, 'compose_file_path'));
    const composeServiceName = getStringValue(readProperty(propertyMap, 'compose_service_name'));
    const persistedRuntimeRef = readProperty(propertyMap, 'runtime_ref');
    const runtimeRef = persistedRuntimeRef || `${namespace}/${workloadName}`;
    const autoAssignedDomain = buildManagedAppAutoDomain(serviceId, config.defaultDomainSuffix);
    const persistedDomain = readProperty(propertyMap, 'app_domain');
    const hasProvisionedRuntime = Boolean(persistedRuntimeRef
        || readProperty(propertyMap, 'k8s_namespace')
        || readProperty(propertyMap, 'k8s_workload'));
    const resolvedInitialDomain = hasProvisionedRuntime
        ? (persistedDomain ?? autoAssignedDomain)
        : (autoAssignedDomain ?? persistedDomain);
    return {
        serviceId,
        serviceLabel: baseLabel,
        productSlug,
        runtimeRef,
        runtimeLabel: sanitizeKubernetesLabelValue(runtimeRef, workloadName),
        clusterRef: readProperty(propertyMap, 'k8s_cluster_ref') || config.defaultClusterRef,
        namespace,
        workloadName,
        workloadKind,
        serviceName: readProperty(propertyMap, 'k8s_service') || `${baseSlug}-svc`,
        ingressName: `${baseSlug}-ing`,
        envSecretName: `${baseSlug}-env`,
        pvcName: `${baseSlug}-data`,
        buildJobName: readProperty(propertyMap, 'app_build_job_name') || generatedBuildJobName,
        imagePullSecretName: 'managed-app-registry',
        imageRef,
        desiredReplicas,
        replicaLimit,
        runtimePort,
        storageSize: getStringValue(readProperty(propertyMap, 'persistent_storage_size') || productSettings.persistent_storage_size) || planBaseline.storageSize,
        gitRepoUrl: getStringValue(readProperty(propertyMap, 'git_repo_url')),
        gitBranch: getStringValue(readProperty(propertyMap, 'git_branch')) || 'main',
        gitContextDir: getStringValue(readProperty(propertyMap, 'git_context_dir')) || '.',
        dockerfilePath: getStringValue(readProperty(propertyMap, 'dockerfile_path')) || 'Dockerfile',
        composeFilePath: composeFilePath || null,
        composeServiceName: composeServiceName || null,
        domain: options.overrideDomain ?? resolvedInitialDomain,
        ingressEnabled: getBooleanValue(readProperty(propertyMap, 'ingress_enabled') || productSettings.ingress_enabled, true),
        tlsEnabled: getBooleanValue(readProperty(propertyMap, 'tls_enabled') || productSettings.tls_enabled, true),
        envVars,
        buildNamespace: getStringValue(readProperty(propertyMap, 'managed_app_build_namespace')) || config.buildNamespace || namespace,
        buildTimestamp,
        runtimeCpuLimit,
        runtimeMemoryLimit,
        runtimeCpuRequest,
        runtimeMemoryRequest,
        buildCpuLimit: getStringValue(readProperty(propertyMap, 'build_cpu_limit') || productSettings.build_cpu_limit) || planBaseline.buildCpuLimit,
        buildMemoryLimit: getStringValue(readProperty(propertyMap, 'build_memory_limit') || productSettings.build_memory_limit) || planBaseline.buildMemoryLimit,
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
function buildRuntimeProperties(spec, snapshot) {
    const normalizedImageTag = extractImageTag(spec.imageRef) || spec.imageTag;
    const deployedImageRef = getStringValue(snapshot.properties?.app_deployed_image_ref);
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
        app_deployed_image_ref: deployedImageRef,
        app_previous_image_ref: spec.previousImageRef ?? '',
        app_image_tag: normalizedImageTag,
        runtime_port: String(spec.runtimePort),
        git_context_dir: spec.gitContextDir,
        dockerfile_path: spec.dockerfilePath,
        compose_file_path: spec.composeFilePath ?? '',
        compose_service_name: spec.composeServiceName ?? '',
        env_vars: JSON.stringify(spec.envVars),
        app_domain_limit: String(spec.domainLimit),
        app_env_var_limit: String(spec.envVarLimit),
        app_log_retention_lines: String(spec.logRetentionLines),
        app_build_job_name: spec.buildJobName,
    };
}
export function createManagedAppRuntimeManager(config) {
    async function runKubectl(args, stdin) {
        if (!config.enabled)
            throw new ManagedAppRuntimeError('Managed App runtime is disabled.', 503, 'MANAGED_APP_DISABLED');
        if (config.driver === 'contract')
            throw new ManagedAppRuntimeError('Managed App runtime driver is contract-only.', 501, 'MANAGED_APP_CONTRACT_ONLY');
        validateKubeconfig(config);
        const env = {
            ...process.env,
            ...(config.driver === 'kubeconfig' && config.kubeconfigPath ? { KUBECONFIG: config.kubeconfigPath } : {}),
        };
        return await new Promise((resolve, reject) => {
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
            if (stdin)
                child.stdin.write(stdin);
            child.stdin.end();
        });
    }
    async function kubectlJson(args) {
        const output = await runKubectl([...args, '-o', 'json']);
        return output ? JSON.parse(output) : null;
    }
    async function kubectlOptionalJson(args) {
        try {
            return await kubectlJson(args);
        }
        catch (error) {
            if (error instanceof ManagedAppRuntimeError && String(error.message).toLowerCase().includes('notfound'))
                return null;
            throw error;
        }
    }
    async function applyManifest(items) {
        await runKubectl(['apply', '-f', '-'], JSON.stringify({ apiVersion: 'v1', kind: 'List', items }));
    }
    async function ensureNamespace(namespace, labels = {}) {
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
    async function ensureRegistrySecret(namespace, secretName) {
        if (!config.registryAuthJson)
            return;
        await applyManifest([{
                apiVersion: 'v1',
                kind: 'Secret',
                metadata: { name: secretName, namespace },
                type: 'kubernetes.io/dockerconfigjson',
                stringData: { '.dockerconfigjson': config.registryAuthJson },
            }]);
    }
    function buildNamespaceSecurityResources(spec) {
        const labels = {
            'sloth.cloud/service-id': spec.serviceId,
            'sloth.cloud/runtime-kind': 'managed-app',
            'app.kubernetes.io/instance': spec.runtimeLabel,
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
                        ...(spec.runtimeCpuLimit ? { 'limits.cpu': spec.runtimeCpuLimit } : {}),
                        ...(spec.runtimeCpuRequest ? { 'requests.cpu': spec.runtimeCpuRequest } : {}),
                        ...(spec.runtimeMemoryLimit ? { 'limits.memory': spec.runtimeMemoryLimit } : {}),
                        ...(spec.runtimeMemoryRequest ? { 'requests.memory': spec.runtimeMemoryRequest } : {}),
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
                                ...(spec.runtimeCpuRequest ? { cpu: spec.runtimeCpuRequest } : {}),
                                ...(spec.runtimeMemoryRequest ? { memory: spec.runtimeMemoryRequest } : {}),
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
                    compose_file_path: spec.composeFilePath ?? '',
                    compose_service_name: spec.composeServiceName ?? '',
                },
            },
        ];
    }
    function buildBuildJob(spec) {
        const dockerfileDir = spec.dockerfilePath.includes('/') ? spec.dockerfilePath.slice(0, spec.dockerfilePath.lastIndexOf('/')) : '.';
        const dockerfileName = spec.dockerfilePath.includes('/') ? spec.dockerfilePath.slice(spec.dockerfilePath.lastIndexOf('/') + 1) : spec.dockerfilePath;
        const contextDir = spec.gitContextDir === '/' ? '.' : spec.gitContextDir;
        const fallbackDockerfileName = '.sloth.generated.Dockerfile';
        // Keep fallback base image on a public mirror by default so build does not
        // hard-fail when the local registry only stores output images.
        const defaultFallbackNodeImage = 'docker.m.daocloud.io/library/node:22-alpine';
        const fallbackNodeImage = getStringValue(process.env.MANAGED_APP_FALLBACK_NODE_IMAGE) || defaultFallbackNodeImage;
        const fallbackNodeImageForSed = fallbackNodeImage.replace(/&/g, '\\&');
        const fallbackNpmRegistry = getStringValue(process.env.MANAGED_APP_FALLBACK_NPM_REGISTRY);
        const fallbackNpmRegistryLine = fallbackNpmRegistry ? `RUN npm config set registry ${fallbackNpmRegistry}` : '';
        const rewriteNodeBaseImage = getBooleanValue(process.env.MANAGED_APP_REWRITE_NODE_BASE_IMAGE, true);
        const rewriteNodeBaseImageFlag = rewriteNodeBaseImage ? '1' : '0';
        const preferGeneratedNodeDockerfile = getBooleanValue(process.env.MANAGED_APP_PREFER_GENERATED_NODE_DOCKERFILE, false);
        const preferGeneratedNodeDockerfileFlag = preferGeneratedNodeDockerfile ? '1' : '0';
        const insecureRegistryHost = normalizeRegistryHost(config.imageRegistry);
        const insecureRegistryEnabled = getBooleanValue(process.env.MANAGED_APP_IMAGE_REGISTRY_INSECURE, false);
        const githubRepo = parseGitHubRepo(spec.gitRepoUrl);
        const archiveSource = isArchiveSourceUrl(spec.gitRepoUrl);
        const githubFallbackScript = githubRepo
            ? `\necho \"git clone failed, trying GitHub archive fallback\"\nrm -rf /workspace/source/*\nwget -O /tmp/source.tgz ${shQuote(`https://codeload.github.com/${githubRepo.owner}/${githubRepo.repo}/tar.gz/refs/heads/${spec.gitBranch}`)}\ntar -xzf /tmp/source.tgz -C /workspace/source --strip-components=1\nrm -f /tmp/source.tgz`
            : '\nexit 1';
        const archiveCloneScript = `set -eu\nrm -rf /workspace/source\nmkdir -p /workspace/source\nwget -O /tmp/source.tgz ${shQuote(spec.gitRepoUrl)}\ntar -xzf /tmp/source.tgz -C /workspace/source\nrm -f /tmp/source.tgz`;
        const cloneScript = archiveSource
            ? archiveCloneScript
            : `set -eu\nrm -rf /workspace/source\nmkdir -p /workspace/source\nif ! git clone --depth 1 --branch ${shQuote(spec.gitBranch)} ${shQuote(spec.gitRepoUrl)} /workspace/source; then${githubFallbackScript}\nfi`;
        const buildkitRegistryConfigScript = insecureRegistryEnabled && insecureRegistryHost
            ? `cat > /tmp/buildkitd.toml <<'SLTH_BUILDKIT'
[registry."${insecureRegistryHost}"]
  http = true
  insecure = true
SLTH_BUILDKIT
if [ -n "\${BUILDKITD_FLAGS:-}" ]; then
  export BUILDKITD_FLAGS="\${BUILDKITD_FLAGS} --config /tmp/buildkitd.toml"
else
  export BUILDKITD_FLAGS="--config /tmp/buildkitd.toml"
fi`
            : '';
        const buildScript = `set -eu
CONTEXT_PATH=/workspace/source
if [ ${shQuote(contextDir)} != '.' ] && [ ${shQuote(contextDir)} != '' ]; then
  CONTEXT_PATH="/workspace/source/${contextDir}"
fi

DOCKERFILE_DIR=/workspace/source/${dockerfileDir === '.' ? '' : dockerfileDir}
DOCKERFILE_NAME=${shQuote(dockerfileName)}

generate_node_fallback_dockerfile() {
  DOCKERFILE_DIR="$CONTEXT_PATH"
  DOCKERFILE_NAME=${shQuote(fallbackDockerfileName)}
  cat > "$DOCKERFILE_DIR/$DOCKERFILE_NAME" <<'SLTH_DOCKERFILE'
FROM ${fallbackNodeImage}
WORKDIR /app
COPY package*.json ./
${fallbackNpmRegistryLine}
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
COPY . .
RUN if npm run | grep -q ' build'; then npm run build; fi \
  && (npm prune --omit=dev --no-audit --no-fund || true) \
  && if [ -f .next/standalone/server.js ]; then cp -R .next/standalone/. ./; fi
ENV NODE_ENV=production
ENV PORT=${spec.runtimePort}
EXPOSE ${spec.runtimePort}
CMD ["sh", "-lc", "BIND_HOST=\${SLOTH_BIND_HOST:-0.0.0.0}; PORT=\${PORT:-${spec.runtimePort}}; export HOSTNAME=\$BIND_HOST PORT; if [ -f server.js ]; then node server.js; elif [ -f .next/standalone/server.js ]; then node .next/standalone/server.js; elif npm run | grep -q ' start'; then npm run start -- --hostname \$BIND_HOST --port \$PORT; else npm run dev -- --hostname \$BIND_HOST --port \$PORT; fi"]
SLTH_DOCKERFILE
}

if [ -f "$CONTEXT_PATH/package.json" ] && [ ${shQuote(preferGeneratedNodeDockerfileFlag)} = '1' ]; then
  echo "Node.js repo detected, forcing generated Dockerfile for resilient build"
  generate_node_fallback_dockerfile
elif [ ! -f "$DOCKERFILE_DIR/$DOCKERFILE_NAME" ]; then
  if [ -f "$CONTEXT_PATH/package.json" ]; then
    echo "Dockerfile not found, generating Node.js fallback Dockerfile"
    generate_node_fallback_dockerfile
  else
    echo "Dockerfile not found at $DOCKERFILE_DIR/$DOCKERFILE_NAME and package.json fallback is unavailable" >&2
    exit 1
  fi
fi

if [ "$DOCKERFILE_NAME" != ${shQuote(fallbackDockerfileName)} ] \
  && [ ${shQuote(rewriteNodeBaseImageFlag)} = '1' ] \
  && grep -Eq '^[[:space:]]*[Ff][Rr][Oo][Mm][[:space:]]+((docker\\.io/)?(library/)?)?node(:[^[:space:]]+)?([[:space:]]+[Aa][Ss][[:space:]]+[[:alnum:]_.-]+)?[[:space:]]*$' "$DOCKERFILE_DIR/$DOCKERFILE_NAME"; then
  echo "Dockerfile uses public node base image, rewriting to ${fallbackNodeImage} for resilient build"
  cp "$DOCKERFILE_DIR/$DOCKERFILE_NAME" "$DOCKERFILE_DIR/$DOCKERFILE_NAME.sloth.bak"
  sed -E "s|^[[:space:]]*[Ff][Rr][Oo][Mm][[:space:]]+((docker\\.io/)?(library/)?)?node(:[^[:space:]]+)?([[:space:]]+[Aa][Ss][[:space:]]+[[:alnum:]_.-]+)?[[:space:]]*$|FROM ${fallbackNodeImageForSed}\\\\5|g" "$DOCKERFILE_DIR/$DOCKERFILE_NAME.sloth.bak" > "$DOCKERFILE_DIR/$DOCKERFILE_NAME"
fi

${buildkitRegistryConfigScript}

buildctl-daemonless.sh build --frontend dockerfile.v0 --local context="$CONTEXT_PATH" --local dockerfile="$DOCKERFILE_DIR" --opt filename="$DOCKERFILE_NAME" --output ${shQuote(`type=image,name=${spec.imageRef},push=true`)}`;
        const proxyEnv = buildForwardProxyEnv();
        const buildkitPrivileged = getBooleanValue(process.env.MANAGED_APP_BUILDKIT_PRIVILEGED, true);
        const buildkitSnapshotter = getStringValue(config.buildkitSnapshotter) || 'native';
        const buildkitRootPath = normalizeBuildkitRootPath(config.buildkitRootPath);
        const buildkitFlags = [
            `--oci-worker-snapshotter=${buildkitSnapshotter}`,
            `--root=${buildkitRootPath}`,
            ...(buildkitPrivileged ? [] : ['--oci-worker-no-process-sandbox']),
        ].join(' ');
        const buildCpuRequest = getStringValue(process.env.MANAGED_APP_BUILD_CPU_REQUEST) || deriveCpuRequest(spec.buildCpuLimit);
        const buildMemoryRequest = getStringValue(process.env.MANAGED_APP_BUILD_MEMORY_REQUEST) || deriveMemoryRequest(spec.buildMemoryLimit);
        const buildEphemeralRequest = getStringValue(process.env.MANAGED_APP_BUILD_EPHEMERAL_REQUEST) || '1Gi';
        const buildEphemeralLimit = getStringValue(process.env.MANAGED_APP_BUILD_EPHEMERAL_LIMIT);
        const workspaceSizeLimit = getStringValue(process.env.MANAGED_APP_BUILD_WORKSPACE_SIZE_LIMIT);
        const buildkitRootSizeLimit = getStringValue(process.env.MANAGED_APP_BUILDKIT_ROOT_SIZE_LIMIT);
        const buildkitEnv = [
            { name: 'BUILDKITD_FLAGS', value: buildkitFlags },
            ...proxyEnv,
        ];
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
                                ...(proxyEnv.length > 0 ? { env: proxyEnv } : {}),
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
                                env: buildkitEnv,
                                volumeMounts: [
                                    { name: 'workspace', mountPath: '/workspace' },
                                    { name: 'buildkit-root', mountPath: buildkitRootPath },
                                    ...(config.registryAuthJson ? [{ name: 'docker-config', mountPath: '/home/user/.docker/config.json', subPath: '.dockerconfigjson' }] : []),
                                ],
                                resources: {
                                    limits: {
                                        ...(spec.buildCpuLimit ? { cpu: spec.buildCpuLimit } : {}),
                                        ...(spec.buildMemoryLimit ? { memory: spec.buildMemoryLimit } : {}),
                                        ...(buildEphemeralLimit ? { 'ephemeral-storage': buildEphemeralLimit } : {}),
                                    },
                                    requests: {
                                        ...(buildCpuRequest ? { cpu: buildCpuRequest } : {}),
                                        ...(buildMemoryRequest ? { memory: buildMemoryRequest } : {}),
                                        ...(buildEphemeralRequest ? { 'ephemeral-storage': buildEphemeralRequest } : {}),
                                    },
                                },
                                securityContext: {
                                    allowPrivilegeEscalation: buildkitPrivileged,
                                    readOnlyRootFilesystem: false,
                                    ...(buildkitPrivileged ? { privileged: true, runAsUser: 0, runAsGroup: 0 } : {}),
                                },
                            }],
                        volumes: [
                            {
                                name: 'workspace',
                                emptyDir: {
                                    ...(workspaceSizeLimit ? { sizeLimit: workspaceSizeLimit } : {}),
                                },
                            },
                            {
                                name: 'buildkit-root',
                                emptyDir: {
                                    ...(buildkitRootSizeLimit ? { sizeLimit: buildkitRootSizeLimit } : {}),
                                },
                            },
                            ...(config.registryAuthJson ? [{ name: 'docker-config', secret: { secretName: spec.imagePullSecretName } }] : []),
                        ],
                    },
                },
            },
        };
    }
    function buildRuntimeResources(spec) {
        const labels = { 'sloth.cloud/service-id': spec.serviceId, 'sloth.cloud/runtime-kind': 'managed-app', 'app.kubernetes.io/name': spec.workloadName, 'app.kubernetes.io/instance': spec.runtimeLabel };
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
                                startupProbe: {
                                    tcpSocket: { port: spec.runtimePort },
                                    periodSeconds: 5,
                                    timeoutSeconds: 2,
                                    failureThreshold: 120,
                                },
                                readinessProbe: {
                                    tcpSocket: { port: spec.runtimePort },
                                    periodSeconds: 5,
                                    timeoutSeconds: 2,
                                    failureThreshold: 6,
                                },
                                livenessProbe: {
                                    tcpSocket: { port: spec.runtimePort },
                                    periodSeconds: 15,
                                    timeoutSeconds: 2,
                                    failureThreshold: 6,
                                },
                                resources: {
                                    limits: {
                                        ...(spec.runtimeCpuLimit ? { cpu: spec.runtimeCpuLimit } : {}),
                                        ...(spec.runtimeMemoryLimit ? { memory: spec.runtimeMemoryLimit } : {}),
                                    },
                                    requests: {
                                        ...(spec.runtimeCpuRequest ? { cpu: spec.runtimeCpuRequest } : {}),
                                        ...(spec.runtimeMemoryRequest ? { memory: spec.runtimeMemoryRequest } : {}),
                                    },
                                },
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
                : {
                    apiVersion: 'apps/v1',
                    kind: 'Deployment',
                    ...workloadBase,
                    spec: {
                        ...workloadBase.spec,
                        // Keep one-pod-at-a-time rollout so strict plan quotas do not block updates.
                        strategy: {
                            type: 'RollingUpdate',
                            rollingUpdate: {
                                maxSurge: 0,
                                maxUnavailable: 1,
                            },
                        },
                    },
                },
            ...(spec.ingressEnabled && spec.domain ? [{
                    apiVersion: 'networking.k8s.io/v1',
                    kind: 'Ingress',
                    metadata: { name: spec.ingressName, namespace: spec.namespace, labels, annotations: { ...(config.ingressClass ? { 'kubernetes.io/ingress.class': config.ingressClass } : {}), ...(spec.tlsEnabled && config.certIssuer ? { 'cert-manager.io/cluster-issuer': config.certIssuer } : {}) } },
                    spec: {
                        ...(config.ingressClass ? { ingressClassName: config.ingressClass } : {}),
                        rules: [{ host: spec.domain, http: { paths: [{ path: '/', pathType: 'Prefix', backend: { service: { name: spec.serviceName, port: { number: spec.runtimePort } } } }] } }],
                        ...(spec.tlsEnabled && config.certIssuer ? { tls: [{ hosts: [spec.domain], secretName: `${spec.workloadName}-tls` }] } : {}),
                    },
                }] : []),
        ];
    }
    async function readPods(spec) {
        const podsJson = await kubectlOptionalJson(['get', 'pods', '-n', spec.namespace, '-l', `sloth.cloud/service-id=${spec.serviceId}`]);
        return Array.isArray(podsJson?.items) ? podsJson.items : [];
    }
    async function readBuildPods(spec) {
        const podsJson = await kubectlOptionalJson(['get', 'pods', '-n', spec.buildNamespace, '-l', `sloth.cloud/service-id=${spec.serviceId},sloth.cloud/component=build`]);
        return Array.isArray(podsJson?.items) ? podsJson.items : [];
    }
    function detectPodError(pods) {
        const nonTerminalWaitingReasons = new Set([
            'containercreating',
            'podinitializing',
            'creatingcontainer',
            'initializing',
        ]);
        for (const pod of pods) {
            const status = typeof pod.status === 'object' && pod.status !== null ? pod.status : {};
            const containers = Array.isArray(status.containerStatuses) ? status.containerStatuses : [];
            for (const container of containers) {
                const state = typeof container.state === 'object' && container.state !== null ? container.state : {};
                const waiting = typeof state.waiting === 'object' && state.waiting !== null ? state.waiting : {};
                const reason = getStringValue(waiting.reason);
                if (!reason) {
                    continue;
                }
                const normalizedReason = reason.toLowerCase();
                if (nonTerminalWaitingReasons.has(normalizedReason)) {
                    continue;
                }
                return normalizedReason;
            }
        }
        return null;
    }
    function detectBuildPodError(buildPods) {
        const sorted = [...buildPods].sort((left, right) => {
            const leftTime = Date.parse(getStringValue(left.metadata?.creationTimestamp) || '1970-01-01T00:00:00Z');
            const rightTime = Date.parse(getStringValue(right.metadata?.creationTimestamp) || '1970-01-01T00:00:00Z');
            return rightTime - leftTime;
        });
        for (const pod of sorted) {
            const status = typeof pod.status === 'object' && pod.status !== null ? pod.status : {};
            const initStatuses = Array.isArray(status.initContainerStatuses) ? status.initContainerStatuses : [];
            const containerStatuses = Array.isArray(status.containerStatuses) ? status.containerStatuses : [];
            for (const container of [...containerStatuses, ...initStatuses]) {
                const state = typeof container.state === 'object' && container.state !== null ? container.state : {};
                const waiting = typeof state.waiting === 'object' && state.waiting !== null ? state.waiting : {};
                const terminated = typeof state.terminated === 'object' && state.terminated !== null ? state.terminated : {};
                const waitingReason = getStringValue(waiting.reason);
                const terminatedReason = getStringValue(terminated.reason);
                if (waitingReason)
                    return waitingReason.toLowerCase();
                if (terminatedReason && terminatedReason.toLowerCase() !== 'completed')
                    return terminatedReason.toLowerCase();
            }
        }
        return null;
    }
    async function readBuildFailureLogLine(spec, buildPods) {
        const latestBuildPod = [...buildPods]
            .sort((left, right) => {
            const leftTime = Date.parse(getStringValue(left.metadata?.creationTimestamp) || '1970-01-01T00:00:00Z');
            const rightTime = Date.parse(getStringValue(right.metadata?.creationTimestamp) || '1970-01-01T00:00:00Z');
            return rightTime - leftTime;
        })[0];
        const podName = getStringValue(latestBuildPod?.metadata?.name);
        if (!podName) {
            return null;
        }
        try {
            const logs = await runKubectl(['logs', podName, '-n', spec.buildNamespace, '-c', 'buildkit', '--tail=60']);
            const line = logs
                .split(/\r?\n/)
                .map((entry) => entry.trim())
                .filter((entry) => entry !== '')
                .slice(-1)[0];
            return line || null;
        }
        catch {
            return null;
        }
    }
    async function rollbackWorkload(spec, targetImage) {
        if (targetImage) {
            await runKubectl(['set', 'image', `${spec.workloadKind.toLowerCase()}/${spec.workloadName}`, 'app=' + targetImage, '-n', spec.namespace]);
            return;
        }
        await runKubectl(['rollout', 'undo', `${spec.workloadKind.toLowerCase()}/${spec.workloadName}`, '-n', spec.namespace]);
    }
    async function snapshot(service, options = {}) {
        const spec = buildSpec(config, service, options);
        const namespaceJson = await kubectlOptionalJson(['get', 'namespace', spec.namespace]);
        if (!namespaceJson) {
            const previousStatus = getStringValue(options.serviceProperties?.app_status);
            const resettableStates = new Set(['queued', 'building', 'pushing', 'deploying', 'retrying', 'deleting']);
            const normalizedStatus = resettableStates.has(previousStatus) ? 'pending' : (previousStatus || 'pending');
            const runtime = {
                kind: 'managed-app',
                contractVersion: '2026-04-pr4',
                runtimeRef: spec.runtimeRef,
                status: normalizedStatus,
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
        const jobItems = Array.isArray(jobsJson?.items) ? jobsJson.items : [];
        const latestJob = [...jobItems].sort((left, right) => Date.parse(String(right.metadata?.creationTimestamp ?? '0')) - Date.parse(String(left.metadata?.creationTimestamp ?? '0')))[0];
        const jobStatus = latestJob && typeof latestJob.status === 'object' && latestJob.status !== null ? latestJob.status : {};
        const activeBuilds = getNumberValue(jobStatus.active, 0);
        const failedBuilds = getNumberValue(jobStatus.failed, 0);
        const succeededBuilds = getNumberValue(jobStatus.succeeded, 0);
        const readyReplicas = workloadJson && typeof workloadJson.status === 'object' && workloadJson.status !== null ? getNumberValue(workloadJson.status.readyReplicas, 0) : 0;
        const desiredReplicas = workloadJson && typeof workloadJson.spec === 'object' && workloadJson.spec !== null ? getNumberValue(workloadJson.spec.replicas, spec.desiredReplicas) : spec.desiredReplicas;
        const ingressHost = Array.isArray(ingressJson?.spec?.rules) ? getStringValue(((ingressJson?.spec).rules[0] ?? {}).host) : '';
        const tlsEntries = Array.isArray(ingressJson?.spec?.tls) ? (ingressJson?.spec).tls : [];
        const workloadContainers = Array.isArray(((workloadJson?.spec?.template?.spec?.containers))) ? (workloadJson?.spec?.template?.spec?.containers) : [];
        const deployedImageRef = getStringValue((workloadContainers[0] ?? {}).image);
        const tlsSecretNames = tlsEntries
            .map((entry) => getStringValue(entry.secretName))
            .filter((entry) => entry !== '');
        let tlsSecretReady = false;
        if (tlsSecretNames.length > 0) {
            const tlsSecrets = await Promise.all(tlsSecretNames.map((secretName) => kubectlOptionalJson(['get', 'secret', secretName, '-n', spec.namespace])));
            tlsSecretReady = tlsSecrets.every((entry) => Boolean(entry));
        }
        const envJson = envSecret && typeof envSecret.data === 'object' && envSecret.data !== null ? JSON.stringify(Object.fromEntries(Object.entries(envSecret.data).map(([key, value]) => [key, Buffer.from(String(value ?? ''), 'base64').toString('utf8')]))) : JSON.stringify(spec.envVars);
        const podError = detectPodError(pods);
        const buildPodError = detectBuildPodError(buildPods);
        const previousStatus = getStringValue(options.serviceProperties?.app_status) || null;
        const lastWorkloadReason = findLatestConditionReason(workloadJson?.status?.conditions);
        const buildFailed = failedBuilds > 0;
        const buildActive = activeBuilds > 0;
        const buildCompleted = succeededBuilds > 0;
        const buildFailureLogLine = buildFailed ? await readBuildFailureLogLine(spec, buildPods) : null;
        const buildFailureReason = (buildFailureLogLine || buildPodError || '').trim();
        let status = 'pending';
        if (String(namespaceJson.metadata?.deletionTimestamp ?? '') !== '') {
            status = 'deleting';
        }
        else if (buildFailed) {
            status = 'failed';
        }
        else if (buildActive) {
            status = readBuildPhase(buildPods, previousStatus);
        }
        else if (buildCompleted && !workloadJson) {
            status = 'pushing';
        }
        else if (workloadJson && desiredReplicas > 0 && readyReplicas < desiredReplicas) {
            status = podError ? 'failed' : 'deploying';
        }
        else if (desiredReplicas > 0 && readyReplicas >= desiredReplicas && readyReplicas > 0) {
            status = 'ready';
        }
        else if (podError) {
            status = 'failed';
        }
        else if (latestJob) {
            status = buildCompleted ? 'deploying' : 'queued';
        }
        const endpoint = ingressHost ? `${tlsSecretReady ? 'https' : 'http'}://${ingressHost}` : getStringValue(serviceJson?.spec?.clusterIP) || null;
        const runtime = {
            kind: 'managed-app',
            contractVersion: '2026-04-pr4',
            runtimeRef: spec.runtimeRef,
            status,
            endpoint,
            lastDeployAt: getStringValue(workloadJson?.metadata?.annotations ? (workloadJson?.metadata).annotations['sloth.cloud/last-deploy-at'] : null) || null,
            managedApp: { clusterRef: spec.clusterRef, namespace: spec.namespace, workload: spec.workloadName, service: spec.serviceName, ingressUrl: ingressHost ? endpoint : null },
            vps: null,
            domain: ingressHost || spec.domain,
            tlsStatus: tlsSecretReady ? 'enabled' : (spec.tlsEnabled && !!config.certIssuer ? 'pending' : 'disabled'),
            replicas: desiredReplicas,
            envJson,
        };
        return {
            runtime,
            properties: {
                ...buildRuntimeProperties(spec, { runtime, properties: { app_deployed_image_ref: deployedImageRef } }),
                ...((buildFailed && buildFailureReason !== '') ? { app_status_reason: buildFailureReason } : {}),
                ...((!buildFailed && podError) ? { app_status_reason: podError } : {}),
                ...(lastWorkloadReason ? { app_rollout_reason: lastWorkloadReason } : {}),
            },
        };
    }
    async function provision(service, options = {}) {
        const previousImageRef = getStringValue(options.serviceProperties?.app_image_ref) || null;
        const requestedSpec = buildSpec(config, service, {
            ...options,
            serviceProperties: {
                ...(options.serviceProperties ?? {}),
                ...(options.forceReprovision ? { app_previous_image_ref: previousImageRef ?? '' } : {}),
                app_image_ref: '',
                app_build_job_name: '',
            },
        });
        const spec = await resolveProvisioningSpecWithCompose(requestedSpec);
        const sourceUrl = parseSourceUrl(spec.gitRepoUrl);
        const archiveSource = isArchiveSourceUrl(spec.gitRepoUrl);
        const sourceProtocol = sourceUrl?.protocol ?? '';
        if (archiveSource) {
            if (!['http:', 'https:'].includes(sourceProtocol)) {
                throw new ManagedAppRuntimeError('Only HTTP or HTTPS source archives are supported for generated projects.', 422, 'MANAGED_APP_SOURCE_ARCHIVE_INVALID');
            }
        }
        else if (!spec.gitRepoUrl.startsWith('https://')) {
            throw new ManagedAppRuntimeError('Only public HTTPS Git repositories are supported in v1.', 422, 'MANAGED_APP_GIT_REPO_INVALID');
        }
        await ensureNamespace(spec.namespace, {
            'sloth.cloud/service-id': spec.serviceId,
            'sloth.cloud/runtime-ref': spec.runtimeLabel,
        });
        await ensureRegistrySecret(spec.namespace, spec.imagePullSecretName);
        if (spec.buildNamespace !== spec.namespace) {
            await ensureNamespace(spec.buildNamespace, {
                'sloth.cloud/build-namespace': 'true',
            });
            await ensureRegistrySecret(spec.buildNamespace, spec.imagePullSecretName);
        }
        await applyManifest(buildNamespaceSecurityResources(spec));
        const existingJobsJson = await kubectlOptionalJson(['get', 'jobs', '-n', spec.buildNamespace, '-l', `sloth.cloud/service-id=${spec.serviceId},sloth.cloud/component=build`]);
        const existingJobItems = Array.isArray(existingJobsJson?.items) ? existingJobsJson.items : [];
        const activeBuildJob = [...existingJobItems]
            .sort((left, right) => Date.parse(String(right.metadata?.creationTimestamp ?? '0')) - Date.parse(String(left.metadata?.creationTimestamp ?? '0')))
            .find((job) => {
            const status = typeof job.status === 'object' && job.status !== null ? job.status : {};
            return getNumberValue(status.active, 0) > 0;
        });
        if (activeBuildJob) {
            const existingName = getStringValue(activeBuildJob.metadata?.name);
            if (existingName) {
                spec.buildJobName = existingName;
            }
        }
        else {
            await applyManifest([buildBuildJob(spec)]);
        }
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
                runtime_port: String(spec.runtimePort),
                git_context_dir: spec.gitContextDir,
                dockerfile_path: spec.dockerfilePath,
                compose_file_path: spec.composeFilePath ?? '',
                compose_service_name: spec.composeServiceName ?? '',
                env_vars: JSON.stringify(spec.envVars),
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
                runtime_port: String(spec.runtimePort),
                git_context_dir: spec.gitContextDir,
                dockerfile_path: spec.dockerfilePath,
                compose_file_path: spec.composeFilePath ?? '',
                compose_service_name: spec.composeServiceName ?? '',
                env_vars: JSON.stringify(spec.envVars),
            },
        };
    }
    async function reconcile(service, options = {}) {
        const spec = buildSpec(config, service, options);
        const existingNamespace = await kubectlOptionalJson(['get', 'namespace', spec.namespace]);
        const previousStatus = getStringValue(options.serviceProperties?.app_status).toLowerCase();
        if (!existingNamespace && previousStatus !== 'deleting') {
            return provision(service, {
                ...options,
                serviceProperties: {
                    ...(options.serviceProperties ?? {}),
                    app_status: 'pending',
                },
            });
        }
        let current = await snapshot(service, options);
        const desiredEndpoint = spec.domain ? `${(spec.tlsEnabled && !!config.certIssuer) ? 'https' : 'http'}://${spec.domain}` : null;
        const runtimeDomain = getStringValue(current.runtime.domain);
        const runtimeEndpoint = getStringValue(current.runtime.endpoint);
        const desiredImageRef = getStringValue(spec.imageRef);
        const deployedImageRef = getStringValue(current.properties?.app_deployed_image_ref);
        const imageNeedsSync = desiredImageRef !== ''
            && desiredImageRef !== deployedImageRef
            && current.runtime.status !== 'building'
            && current.runtime.status !== 'queued';
        const runtimeNeedsSync = current.runtime.status === 'pushing'
            || (spec.domain !== null && runtimeDomain !== spec.domain)
            || (desiredEndpoint !== null && runtimeEndpoint !== desiredEndpoint)
            || imageNeedsSync;
        if (runtimeNeedsSync) {
            await ensureNamespace(spec.namespace, {
                'sloth.cloud/service-id': spec.serviceId,
                'sloth.cloud/runtime-ref': spec.runtimeLabel,
            });
            await ensureRegistrySecret(spec.namespace, spec.imagePullSecretName);
            await applyManifest(buildNamespaceSecurityResources(spec));
            await applyManifest(buildRuntimeResources(spec));
            current = await snapshot(service, {
                ...options,
                serviceProperties: {
                    ...(options.serviceProperties ?? {}),
                    app_domain: spec.domain ?? '',
                    app_status: 'deploying',
                },
            });
            const message = current.runtime.status === 'pushing'
                ? 'Managed App image build succeeded. Workload deployment started.'
                : 'Managed App runtime resources reconciled with desired domain and endpoint.';
            return { message, runtime: current.runtime, properties: current.properties };
        }
        return { message: 'Managed App runtime state reconciled.', runtime: current.runtime, properties: current.properties };
    }
    async function restart(service, options = {}) {
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
    async function deleteRuntime(service, options = {}) {
        const spec = buildSpec(config, service, options);
        await runKubectl(['delete', 'namespace', spec.namespace, '--ignore-not-found=true', '--wait=false']);
        const runtime = { kind: 'managed-app', contractVersion: '2026-04-pr4', runtimeRef: spec.runtimeRef, status: 'deleting', endpoint: null, lastDeployAt: isoTimestamp(), managedApp: { clusterRef: spec.clusterRef, namespace: spec.namespace, workload: spec.workloadName, service: spec.serviceName, ingressUrl: null }, vps: null, domain: spec.domain, tlsStatus: spec.tlsEnabled ? 'pending' : 'disabled', replicas: null, envJson: JSON.stringify(spec.envVars) };
        return { message: 'Managed App deletion submitted.', runtime, properties: buildRuntimeProperties(spec, { runtime, properties: {} }) };
    }
    async function updateEnv(service, env, options = {}) {
        const spec = buildSpec(config, service, { ...options, overrideEnv: env });
        await ensureNamespace(spec.namespace);
        await applyManifest([{ apiVersion: 'v1', kind: 'Secret', metadata: { name: spec.envSecretName, namespace: spec.namespace }, type: 'Opaque', stringData: spec.envVars }]);
        await runKubectl(['rollout', 'restart', `${spec.workloadKind.toLowerCase()}/${spec.workloadName}`, '-n', spec.namespace]);
        const current = await snapshot(service, { ...options, serviceProperties: { ...(options.serviceProperties ?? {}), app_env_vars: JSON.stringify(spec.envVars), app_status: 'deploying' } });
        return { message: 'Managed App environment variables updated.', runtime: current.runtime, properties: current.properties };
    }
    async function updateDomain(service, domain, options = {}) {
        const spec = buildSpec(config, service, { ...options, overrideDomain: domain });
        await ensureNamespace(spec.namespace);
        await applyManifest(buildRuntimeResources(spec).filter((item) => item.kind === 'Ingress'));
        const current = await snapshot(service, { ...options, serviceProperties: { ...(options.serviceProperties ?? {}), app_domain: domain, app_status: 'deploying' } });
        return { message: 'Managed App domain updated.', runtime: current.runtime, properties: current.properties };
    }
    async function updateTls(service, domain, options = {}) {
        const spec = buildSpec(config, service, { ...options, overrideDomain: domain });
        if (!spec.domain)
            throw new ManagedAppRuntimeError('A domain is required before enabling HTTPS.', 422, 'MANAGED_APP_TLS_DOMAIN_REQUIRED');
        await ensureNamespace(spec.namespace);
        await applyManifest(buildRuntimeResources({ ...spec, tlsEnabled: true }).filter((item) => item.kind === 'Ingress'));
        const current = await snapshot(service, { ...options, serviceProperties: { ...(options.serviceProperties ?? {}), app_domain: spec.domain, app_status: 'deploying' } });
        return { message: 'Managed App HTTPS configuration updated.', runtime: current.runtime, properties: current.properties };
    }
    async function scale(service, replicas, options = {}) {
        const spec = buildSpec(config, service, { ...options, overrideReplicas: replicas });
        if (replicas > spec.replicaLimit)
            throw new ManagedAppRuntimeError(`Replica count exceeds the plan limit (${spec.replicaLimit}).`, 422, 'MANAGED_APP_SCALE_LIMIT_EXCEEDED', { replicaLimit: spec.replicaLimit });
        await runKubectl(['scale', `${spec.workloadKind.toLowerCase()}/${spec.workloadName}`, '-n', spec.namespace, `--replicas=${replicas}`]);
        const current = await snapshot(service, { ...options, serviceProperties: { ...(options.serviceProperties ?? {}), app_replicas: String(replicas), app_status: 'deploying' } });
        return { message: 'Managed App scale updated.', runtime: current.runtime, properties: current.properties };
    }
    async function logs(service, limit, options = {}) {
        const spec = buildSpec(config, service, options);
        const pods = await readPods(spec);
        const podName = pods.map((pod) => getStringValue(pod.metadata?.name)).find((entry) => entry !== '');
        if (!podName)
            return { message: 'No application logs are available yet.', data: { serviceId: spec.serviceId, runtimeKind: 'managed-app', podName: null, logs: [] } };
        const rawLogs = await runKubectl(['logs', podName, '-n', spec.namespace, '--all-containers=true', `--tail=${Math.max(1, limit)}`]);
        return { message: 'Managed App logs fetched successfully.', data: { serviceId: spec.serviceId, runtimeKind: 'managed-app', podName, logs: rawLogs.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-spec.logRetentionLines).map((line) => ({ line })) } };
    }
    async function rollback(service, options = {}) {
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
