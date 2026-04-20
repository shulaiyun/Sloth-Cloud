<?php

namespace App\Services\VpsApps;

use App\Helpers\ExtensionHelper;
use App\Models\Service;
use App\Models\VpsAppInstall;
use Illuminate\Support\Str;
use phpseclib3\Net\SSH2;
use RuntimeException;

class VpsAppSshExecutor
{
    /**
     * @return array{host: string, username: string, logs: array<int, string>, panel_url: string|null, panel_username: string|null, panel_password: string|null}
     */
    public function execute(VpsAppInstall $install): array
    {
        $install->loadMissing(['service.product.server.settings', 'service.properties', 'recipe', 'app']);

        $service = $install->service;
        if (!$service instanceof Service || !$service->product?->server) {
            throw new RuntimeException('Install record is missing the backing VPS service or server definition.');
        }

        $extension = ExtensionHelper::getExtension('server', $service->product->server->extension, $service->product->server->settings);
        if (!method_exists($extension, 'getServer') || !method_exists($extension, 'rotateServerPassword')) {
            throw new RuntimeException('The current VPS provider does not expose server inspection and password rotation helpers.');
        }

        $properties = ExtensionHelper::getServiceProperties($service);
        $serverRef = trim((string) ($properties['convoy_server_uuid'] ?? $properties['server_uuid'] ?? ''));
        if ($serverRef === '') {
            throw new RuntimeException('The current VPS service does not have a server runtime mapping yet.');
        }

        $serverPayload = $extension->getServer($serverRef);
        $serverStatus = $this->extractServerStatus($serverPayload);
        if (!$this->isServerReadyForSsh($serverStatus)) {
            throw new RuntimeException(
                sprintf(
                    'The VPS runtime is not ready for SSH app installation yet%s.',
                    $serverStatus !== null ? " (status: {$serverStatus})" : ''
                )
            );
        }

        $host = $this->extractPrimaryAddress($serverPayload);
        if (!$host) {
            throw new RuntimeException('No reachable server IP address was found for this VPS.');
        }

        $password = trim((string) (
            $properties['password']
            ?? $properties['account_password']
            ?? $properties['server_password']
            ?? $properties['root_password']
            ?? ''
        ));
        if ($password === '') {
            $password = $this->generatePassword();
            $extension->rotateServerPassword($serverRef, $password);

            $service->properties()->updateOrCreate(['key' => 'password'], ['name' => 'Server Password', 'value' => $password]);
            $service->properties()->updateOrCreate(['key' => 'account_password'], ['name' => 'Server Account Password', 'value' => $password]);
            $service->properties()->updateOrCreate(['key' => 'password_source'], ['name' => 'Password Source', 'value' => 'install-runtime']);
            $service->properties()->updateOrCreate(['key' => 'password_updated_at'], ['name' => 'Password Updated At', 'value' => now()->toISOString()]);
            $service->unsetRelation('properties');
        }

        $recipe = $install->recipe;
        $script = trim((string) ($recipe?->script_body ?? ''));
        if ($script === '') {
            throw new RuntimeException('This app recipe does not have an installation script configured.');
        }

        $usernames = array_values(array_unique(array_filter([
            trim((string) ($properties['password_login_username'] ?? '')),
            trim((string) ($recipe?->default_login_username ?? '')),
            ...$this->defaultUsernamesForOs(trim((string) ($install->requested_os ?? $properties['selected_os'] ?? $properties['os'] ?? ''))),
        ])));

        $lastError = null;
        foreach ($usernames as $username) {
            $ssh = new SSH2($host, (int) config('vps_apps.ssh.port', 22), (int) config('vps_apps.ssh.timeout_seconds', 45));
            $ssh->setTimeout((int) ($recipe?->script_timeout_seconds ?? config('vps_apps.ssh.timeout_seconds', 45)));
            if (!$ssh->login($username, $password)) {
                $lastError = "Authentication failed for SSH username [{$username}].";
                continue;
            }

            $remoteScript = '/tmp/sloth-app-install-' . $install->id . '-' . Str::random(6) . '.sh';
            $remoteScriptPayload = $remoteScript . '.b64';
            $encodedScript = chunk_split(base64_encode($this->buildScriptPrefix($install) . $script . "\n"), 76, "\n");
            $prefix = $username === 'root' ? '' : 'sudo -n ';
            $command = implode("\n", [
                "cat > {$remoteScriptPayload} <<'SLOTH_INSTALL_EOF'",
                trim($encodedScript),
                'SLOTH_INSTALL_EOF',
                "base64 -d {$remoteScriptPayload} > {$remoteScript}",
                "rm -f {$remoteScriptPayload}",
                "chmod +x {$remoteScript}",
                "{$prefix}bash {$remoteScript} 2>&1",
                'status=$?',
                "rm -f {$remoteScript}",
                'exit $status',
            ]);

            $output = (string) $ssh->exec($command);
            $exitCode = $ssh->getExitStatus();

            if ($exitCode !== null && $exitCode !== 0) {
                throw new RuntimeException(trim($output) !== '' ? trim($output) : "The installer exited with status {$exitCode}.");
            }

            $panelUrl = $this->detectPanelUrlFromOutput($output, $host)
                ?? $this->panelUrlFor($host, $recipe?->panel_scheme, $recipe?->panel_port, $recipe?->panel_path);
            $panelCredentials = $this->detectPanelCredentialsFromOutput($output);

            return [
                'host' => $host,
                'username' => $username,
                'logs' => $this->normalizeLogs($output),
                'panel_url' => $panelUrl,
                'panel_username' => $panelCredentials['username'],
                'panel_password' => $panelCredentials['password'],
            ];
        }

        throw new RuntimeException($lastError ?: 'Unable to authenticate to the VPS over SSH with the available credentials.');
    }

    protected function extractServerStatus(array $payload): ?string
    {
        $server = is_array($payload['server'] ?? null)
            ? $payload['server']
            : (is_array($payload['data'] ?? null) ? $payload['data'] : []);

        $status = trim((string) ($server['status'] ?? ''));

        return $status !== '' ? strtolower($status) : null;
    }

    protected function isServerReadyForSsh(?string $status): bool
    {
        if ($status === null) {
            return true;
        }

        return in_array($status, ['running', 'ready', 'active', 'started'], true);
    }

    protected function buildScriptPrefix(VpsAppInstall $install): string
    {
        $service = $install->service;
        $recipe = $install->recipe;

        return implode("\n", [
            '#!/usr/bin/env bash',
            'set -euo pipefail',
            'export DEBIAN_FRONTEND=noninteractive',
            'export NEEDRESTART_MODE=a',
            'export SLOTH_SERVICE_ID=' . escapeshellarg((string) $service?->id),
            'export SLOTH_APP_SLUG=' . escapeshellarg((string) $install->app?->slug),
            'export SLOTH_APP_TYPE=' . escapeshellarg((string) $install->app?->app_type),
            'export SLOTH_REQUESTED_OS=' . escapeshellarg((string) ($install->requested_os ?? '')),
            'export SLOTH_PANEL_LABEL=' . escapeshellarg((string) ($recipe?->panel_label ?? '')),
            'sloth_wait_for_cloud_init() {',
            '  if ! command -v cloud-init >/dev/null 2>&1; then',
            '    return 0',
            '  fi',
            '',
            '  echo "[sloth] Waiting for cloud-init to finish..."',
            '  cloud-init status --wait >/dev/null 2>&1 || true',
            '}',
            'sloth_package_manager_busy() {',
            '  if ! command -v apt-get >/dev/null 2>&1; then',
            '    return 1',
            '  fi',
            '',
            '  if pgrep -f "apt-get|apt |dpkg|unattended-upgrade( |$)" >/dev/null 2>&1; then',
            '    return 0',
            '  fi',
            '',
            '  if command -v fuser >/dev/null 2>&1; then',
            '    for lock in /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/cache/apt/archives/lock /var/lib/apt/lists/lock; do',
            '      if [ -e "$lock" ] && fuser "$lock" >/dev/null 2>&1; then',
            '        return 0',
            '      fi',
            '    done',
            '  fi',
            '',
            '  return 1',
            '}',
            'sloth_wait_for_package_manager() {',
            '  if ! command -v apt-get >/dev/null 2>&1; then',
            '    return 0',
            '  fi',
            '',
            '  local waited=0',
            '  while sloth_package_manager_busy; do',
            '    if [ "$waited" -eq 0 ]; then',
            '      echo "[sloth] Waiting for apt/dpkg locks to clear..."',
            '    fi',
            '    if [ "$waited" -ge 600 ]; then',
            '      echo "[sloth] apt/dpkg locks did not clear within 600 seconds."',
            '      return 1',
            '    fi',
            '    sleep 5',
            '    waited=$((waited + 5))',
            '  done',
            '',
            '  return 0',
            '}',
            'sloth_prepare_package_manager() {',
            '  if ! command -v apt-get >/dev/null 2>&1; then',
            '    return 0',
            '  fi',
            '',
            '  sloth_wait_for_cloud_init',
            '  sloth_wait_for_package_manager || true',
            '',
            '  mkdir -p /etc/apt/apt.conf.d',
            "  echo 'Acquire::Retries \"5\";' > /etc/apt/apt.conf.d/99sloth-hardening",
            "  echo 'Acquire::ForceIPv4 \"true\";' >> /etc/apt/apt.conf.d/99sloth-hardening",
            "  echo 'Acquire::Languages \"none\";' >> /etc/apt/apt.conf.d/99sloth-hardening",
            "  echo 'Acquire::http::Timeout \"20\";' >> /etc/apt/apt.conf.d/99sloth-hardening",
            "  echo 'Acquire::https::Timeout \"20\";' >> /etc/apt/apt.conf.d/99sloth-hardening",
            "  echo 'Acquire::IndexTargets::deb::DEP-11::DefaultEnabled \"false\";' >> /etc/apt/apt.conf.d/99sloth-hardening",
            '  rm -rf /var/lib/apt/lists/*',
            '',
            '  for attempt in 1 2 3 4 5; do',
            '    dpkg --configure -a || true',
            '    apt-get install -f -y || true',
            '    if apt-get update -y -o Acquire::Retries=5 -o Acquire::ForceIPv4=true -o Acquire::Languages=none; then',
            '      return 0',
            '    fi',
            '',
            '    rm -rf /var/lib/apt/lists/*',
            '    sloth_wait_for_package_manager || true',
            '    sleep $((attempt * 5))',
            '  done',
            '',
            '  return 1',
            '}',
            'sloth_prepare_package_manager',
            '',
        ]);
    }

    /**
     * @return array<int, string>
     */
    protected function defaultUsernamesForOs(string $os): array
    {
        $normalized = strtolower($os);

        if (str_contains($normalized, 'ubuntu')) {
            return ['root', 'ubuntu', 'admin'];
        }

        if (str_contains($normalized, 'debian')) {
            return ['root', 'debian', 'admin'];
        }

        return ['root', 'admin'];
    }

    protected function generatePassword(): string
    {
        $password = Str::password(20);
        while (!preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/', $password)) {
            $password = Str::password(20);
        }

        return $password;
    }

    protected function panelUrlFor(string $host, ?string $scheme, ?int $port, ?string $path): ?string
    {
        if (!$port) {
            return null;
        }

        $normalizedScheme = trim((string) $scheme) !== '' ? trim((string) $scheme) : ($port === 443 ? 'https' : 'http');
        $normalizedPath = trim((string) $path);
        $normalizedPath = $normalizedPath === '' ? '' : '/' . ltrim($normalizedPath, '/');

        return sprintf('%s://%s:%d%s', $normalizedScheme, $host, $port, $normalizedPath);
    }

    protected function detectPanelUrlFromOutput(string $output, string $host): ?string
    {
        $patterns = [
            '/SLOTH_PANEL_URL=(https?:\/\/[^\s]+)/i',
            '/aaPanel\s+Internal\s+Address:\s*(https?:\/\/[^\s]+)/i',
            '/aaPanel\s+Internet\s+Address:\s*(https?:\/\/[^\s]+)/i',
            '/\bhttps?:\/\/(?:SERVER_IP|[a-z0-9\.\-]+):\d+(?:\/[^\s]*)?/i',
        ];

        foreach ($patterns as $pattern) {
            if (!preg_match($pattern, $output, $matches)) {
                continue;
            }

            $candidate = trim((string) ($matches[1] ?? $matches[0] ?? ''));
            if ($candidate === '') {
                continue;
            }

            $candidate = str_replace('SERVER_IP', $host, $candidate);

            return rtrim($candidate, " \t\n\r\0\x0B");
        }

        return null;
    }

    /**
     * @return array{username: string|null, password: string|null}
     */
    protected function detectPanelCredentialsFromOutput(string $output): array
    {
        $username = null;
        $password = null;

        if (preg_match('/(?:SLOTH_PANEL_USERNAME|username)\s*[:=]\s*(\S+)/i', $output, $usernameMatches)) {
            $username = trim((string) ($usernameMatches[1] ?? '')) ?: null;
        }

        if (preg_match('/(?:SLOTH_PANEL_PASSWORD|password)\s*[:=]\s*(\S+)/i', $output, $passwordMatches)) {
            $password = trim((string) ($passwordMatches[1] ?? '')) ?: null;
        }

        return [
            'username' => $username,
            'password' => $password,
        ];
    }

    /**
     * @return array<int, string>
     */
    protected function normalizeLogs(string $output): array
    {
        $limit = max((int) config('vps_apps.queue.log_line_limit', 200), 20);
        $lines = preg_split('/\r\n|\r|\n/', $output) ?: [];
        $lines = array_values(array_filter(array_map(fn ($line) => trim((string) $line), $lines)));
        if (count($lines) > $limit) {
            $lines = array_slice($lines, -$limit);
        }

        return $lines;
    }

    protected function extractPrimaryAddress(array $payload): ?string
    {
        $candidates = [];
        $this->collectAddressCandidates($payload, $candidates);

        foreach ($candidates as $candidate) {
            $candidate = trim((string) $candidate);
            if ($candidate === '' || in_array($candidate, ['127.0.0.1', '0.0.0.0', 'localhost'], true)) {
                continue;
            }

            if (filter_var($candidate, FILTER_VALIDATE_IP) || filter_var($candidate, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME)) {
                return $candidate;
            }
        }

        return null;
    }

    /**
     * @param  array<int, string>  $candidates
     */
    protected function collectAddressCandidates(array $payload, array &$candidates): void
    {
        foreach ($payload as $key => $value) {
            $normalizedKey = strtolower((string) $key);

            if (is_string($value) && in_array($normalizedKey, [
                'ip',
                'ipv4',
                'public_ip',
                'public_ipv4',
                'primary_ip',
                'ip_address',
                'address',
            ], true)) {
                $candidates[] = $value;
            }

            if (is_array($value)) {
                $this->collectAddressCandidates($value, $candidates);
            }
        }
    }
}
