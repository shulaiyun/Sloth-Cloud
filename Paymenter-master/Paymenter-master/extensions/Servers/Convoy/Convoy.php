<?php

namespace Paymenter\Extensions\Servers\Convoy;

use App\Classes\Extension\Server;
use App\Models\Product;
use App\Models\Service;
use Exception;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class Convoy extends Server
{
    public function request($url, $method = 'get', $data = []): array
    {
        $host = (string) $this->config('host');
        $this->guardHost($host);

        // Trim any leading slashes from the base url and add the path URL to it
        $req_url = rtrim($host, '/') . '/api/application/' . $url;
        $request = Http::withHeaders([
            'Authorization' => 'Bearer ' . $this->config('api_key'),
            'Accept' => 'application/json',
        ]);

        $parsedHost = strtolower((string) parse_url($req_url, PHP_URL_HOST));
        if ($this->shouldBypassProxy($parsedHost)) {
            $request = $request->withOptions([
                'proxy' => [
                    'no' => [$parsedHost],
                ],
                'curl' => [
                    CURLOPT_NOPROXY => $parsedHost,
                ],
            ]);
        }

        $response = $request->$method($req_url, $data);

        if (!$response->successful()) {
            $payload = $response->json();
            $message = $this->extractErrorMessage($payload) ?: sprintf('Convoy request failed with status %d.', $response->status());
            throw new Exception($message);
        }

        return $response->json() ?? [];
    }

    /**
     * Get all the configuration for the extension
     *
     * @param  array  $values
     */
    public function getConfig($values = []): array
    {
        return [
            [
                'name' => 'host',
                'type' => 'text',
                'label' => 'Hostname',
                'required' => true,
                'validation' => 'url:http,https',
            ],
            [
                'name' => 'api_key',
                'type' => 'text',
                'label' => 'API Key',
                'required' => true,
            ],
        ];
    }

    /**
     * Get product config
     *
     * @param  array  $values
     */
    public function getProductConfig($values = []): array
    {
        $nodes = $this->request('nodes');
        $options = [];
        foreach ($nodes['data'] as $node) {
            $options[$node['id']] = $node['name'];
        }

        return [
            [
                'name' => 'cpu',
                'type' => 'text',
                'label' => 'CPU Cores',
                'required' => true,
            ],
            [
                'name' => 'ram',
                'type' => 'text',
                'label' => 'RAM (MiB)',
                'required' => true,
            ],
            [
                'name' => 'disk',
                'type' => 'text',
                'label' => 'Disk (MiB)',
                'required' => true,
            ],
            [
                'name' => 'bandwidth',
                'type' => 'text',
                'label' => 'Bandwidth (MiB)',
                'required' => false,
            ],
            [
                'name' => 'snapshot',
                'type' => 'text',
                'label' => 'Amount of snapshots',
                'required' => true,
            ],
            [
                'name' => 'backups',
                'type' => 'text',
                'label' => 'Amount of backups',
                'required' => true,
            ],
            [
                'name' => 'node',
                'type' => 'select',
                'label' => 'Nodes',
                'required' => true,
                'options' => $options,
            ],
            [
                'name' => 'auto_assign_ip',
                'type' => 'checkbox',
                'label' => 'Auto assign IP from pool',
                'required' => false,
            ],
            [
                'name' => 'ipv4',
                'type' => 'number',
                'label' => 'Amount of IPv4 addresses',
                'required' => false,
            ],
            [
                'name' => 'ipv6',
                'type' => 'number',
                'label' => 'Amount of IPv6 addresses',
                'required' => false,
            ],
            [
                'name' => 'start_on_create',
                'type' => 'checkbox',
                'label' => 'Start Server After Completing Installation',
                'required' => false,
            ],
        ];
    }

    public function getCheckoutConfig(Product $product): array
    {
        $options = [];
        $templates = $this->getTemplateOptions($product);
        $catalogService = app(\App\Services\VpsApps\VpsAppCatalogService::class);

        foreach ($catalogService->supportedOsOptionsFromTemplates($templates) as $option) {
            $options[(string) $option['value']] = (string) $option['label'];
        }

        if ($options === []) {
            foreach ($templates as $template) {
                $name = trim((string) ($template['name'] ?? ''));
                if ($name === '') {
                    continue;
                }

                $options[$name] = $name;
            }
        }

        if ($options === []) {
            $options['Ubuntu 22.04'] = 'Ubuntu 22.04';
        }

        return [
            [
                'name' => 'os',
                'type' => 'select',
                'label' => 'Operating System',
                'required' => true,
                'options' => $options,
            ],
            [
                'name' => 'hostname',
                'type' => 'text',
                'label' => 'Hostname',
                'placeholder' => 'server.example.com',
                'required' => true,
                'validation' => 'required|string|max:40',
            ],
            [
                'name' => 'account_password',
                'type' => 'password',
                'label' => 'Custom Password',
                'placeholder' => 'Leave blank to auto-generate',
                'required' => false,
                'validation' => ['nullable', 'string', 'min:8', 'max:50', 'regex:/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,50}$/'],
                'description' => 'Optional. 8-50 characters with uppercase, lowercase, number, and special character. When provided, Convoy will use this password for the initial server account.',
            ],
            [
                'name' => 'password_confirmation',
                'type' => 'password',
                'label' => 'Confirm Password',
                'placeholder' => 'Repeat the custom password',
                'required' => false,
                'validation' => ['nullable', 'string', 'required_with:checkoutConfig.account_password', 'same:checkoutConfig.account_password'],
                'description' => 'Only required when you set a custom password.',
            ],
            [
                'name' => 'primary_app_slug',
                'type' => 'text',
                'label' => 'Primary App',
                'required' => false,
                'validation' => ['nullable', 'string', 'max:191'],
                'description' => 'Reserved for the VPS app marketplace checkout flow.',
            ],
            [
                'name' => 'addon_app_slugs',
                'type' => 'multiselect',
                'label' => 'Addon Apps',
                'required' => false,
                'default' => [],
                'validation' => ['nullable', 'array'],
                'description' => 'Reserved for the VPS app marketplace checkout flow.',
            ],
        ];
    }

    /**
     * @return array<int, array{uuid: string, name: string}>
     */
    public function getTemplateOptions(Product $product): array
    {
        $options = [];
        $node = trim((string) ($product->settings()->where('key', 'node')->first()?->value ?? ''));
        $defaultTemplate = trim((string) ($product->settings()->where('key', 'os')->first()?->value ?? ''));

        if ($defaultTemplate !== '') {
            $options[] = [
                'uuid' => '',
                'name' => $defaultTemplate,
            ];
        }

        if ($node === '') {
            return $options;
        }

        try {
            $payload = $this->request('nodes/' . $node . '/template-groups');
            foreach (($payload['data'] ?? []) as $group) {
                if (!is_array($group)) {
                    continue;
                }

                foreach ($this->extractTemplatesFromGroup($group) as $template) {
                    $options[] = $template;
                }
            }
        } catch (Exception $exception) {
            report($exception);
        }

        return array_values(array_reduce($options, function (array $carry, array $template): array {
            $key = trim((string) ($template['uuid'] ?? '')) . '::' . trim((string) ($template['name'] ?? ''));
            if ($key !== '::') {
                $carry[$key] = [
                    'uuid' => trim((string) ($template['uuid'] ?? '')),
                    'name' => trim((string) ($template['name'] ?? '')),
                ];
            }

            return $carry;
        }, []));
    }

    /**
     * Check if currenct configuration is valid
     */
    public function testConfig(): bool|string
    {
        try {
            $this->guardHost($this->config('host'));
            $this->request('servers');

            return true;
        } catch (Exception $e) {
            return $e->getMessage();
        }

        return true;
    }

    protected function guardHost(?string $host): void
    {
        $host = is_string($host) ? trim($host) : '';
        if ($host === '') {
            throw new Exception('Convoy host is required.');
        }

        $parsedHost = strtolower((string) parse_url($host, PHP_URL_HOST));
        if (in_array($parsedHost, ['localhost', '127.0.0.1', '::1', 'host.docker.internal'], true)) {
            throw new Exception(
                'Convoy host cannot be localhost/host.docker.internal in Docker runtime. Use a container-reachable host, for example http://sloth-convoy-web.'
            );
        }
    }

    protected function shouldBypassProxy(string $host): bool
    {
        if ($host === '') {
            return false;
        }

        if (str_starts_with($host, 'sloth-') || !str_contains($host, '.')) {
            return true;
        }

        $noProxy = array_merge(
            explode(',', (string) env('NO_PROXY', '')),
            explode(',', (string) env('no_proxy', ''))
        );

        foreach ($noProxy as $candidate) {
            $candidate = strtolower(trim($candidate));
            if ($candidate === '') {
                continue;
            }

            if ($host === $candidate) {
                return true;
            }

            if (str_starts_with($candidate, '.') && str_ends_with($host, $candidate)) {
                return true;
            }
        }

        return filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
    }

    /**
     * @return array<int, array{uuid: string, name: string}>
     */
    protected function extractTemplatesFromGroup(array $group): array
    {
        $rawTemplates = $group['templates']['data'] ?? $group['templates'] ?? [];
        if (!is_array($rawTemplates)) {
            return [];
        }

        $templates = [];
        foreach ($rawTemplates as $rawTemplate) {
            if (!is_array($rawTemplate)) {
                continue;
            }

            // Backward compatibility: some Convoy responses return a nested list.
            if (array_is_list($rawTemplate) && isset($rawTemplate[0]) && is_array($rawTemplate[0])) {
                foreach ($rawTemplate as $nestedTemplate) {
                    if (!is_array($nestedTemplate)) {
                        continue;
                    }

                    $uuid = trim((string) ($nestedTemplate['uuid'] ?? ''));
                    $name = trim((string) ($nestedTemplate['name'] ?? ''));
                    if ($uuid === '') {
                        continue;
                    }

                    $templates[] = ['uuid' => $uuid, 'name' => $name];
                }

                continue;
            }

            $uuid = trim((string) ($rawTemplate['uuid'] ?? ''));
            $name = trim((string) ($rawTemplate['name'] ?? ''));
            if ($uuid === '') {
                continue;
            }

            $templates[] = ['uuid' => $uuid, 'name' => $name];
        }

        return $templates;
    }

    protected function resolveTemplateUuid(int $nodeId, mixed $rawTemplate): string
    {
        $candidate = trim((string) $rawTemplate);
        if ($candidate === '') {
            throw new Exception('The selected template uuid is invalid.');
        }

        if (preg_match('/^[0-9a-fA-F-]{36}$/', $candidate) === 1) {
            return $candidate;
        }

        $groups = $this->request('nodes/' . $nodeId . '/template-groups');
        $matches = [];
        foreach ($groups['data'] ?? [] as $group) {
            if (!is_array($group)) {
                continue;
            }

            foreach ($this->extractTemplatesFromGroup($group) as $template) {
                $name = (string) ($template['name'] ?? '');
                $uuid = (string) ($template['uuid'] ?? '');

                if ($uuid === '') {
                    continue;
                }

                $score = $this->templateCandidateScore($candidate, $name);
                if ($score === null) {
                    continue;
                }

                $matches[] = [
                    'uuid' => $uuid,
                    'name' => $name,
                    'score' => $score,
                    'length' => strlen($name),
                ];
            }
        }

        if ($matches !== []) {
            usort($matches, function (array $left, array $right) {
                if ($left['score'] === $right['score']) {
                    return $left['length'] <=> $right['length'];
                }

                return $left['score'] <=> $right['score'];
            });

            return (string) $matches[0]['uuid'];
        }

        throw new Exception('The selected template uuid is invalid.');
    }

    protected function templateAliasKey(string $value): string
    {
        return (string) preg_replace('/[^a-z0-9]+/', '', mb_strtolower($value));
    }

    protected function templateCandidateScore(string $candidate, string $templateName): ?int
    {
        $candidateLower = mb_strtolower($candidate);
        $templateLower = mb_strtolower($templateName);
        $candidateSlug = Str::slug($candidate);
        $templateSlug = Str::slug($templateName);
        $candidateAlias = $this->templateAliasKey($candidate);
        $templateAlias = $this->templateAliasKey($templateName);

        if ($candidateLower === $templateLower || $candidateSlug === $templateSlug || $candidateAlias === $templateAlias) {
            return 0;
        }

        if (str_starts_with($templateLower, $candidateLower) || str_starts_with($templateAlias, $candidateAlias)) {
            return 1;
        }

        if (str_contains($templateLower, $candidateLower) || str_contains($templateAlias, $candidateAlias)) {
            return 2;
        }

        return null;
    }

    protected function extractErrorMessage(mixed $payload): string
    {
        if (is_string($payload) && trim($payload) !== '') {
            return trim($payload);
        }

        if (!is_array($payload)) {
            return '';
        }

        foreach (['message', 'error', 'detail', 'title'] as $key) {
            if (isset($payload[$key]) && is_string($payload[$key]) && trim($payload[$key]) !== '') {
                return trim($payload[$key]);
            }
        }

        if (isset($payload['errors']) && is_array($payload['errors'])) {
            foreach ($payload['errors'] as $entry) {
                if (is_array($entry)) {
                    foreach ($entry as $item) {
                        if (is_string($item) && trim($item) !== '') {
                            return trim($item);
                        }
                    }
                } elseif (is_string($entry) && trim($entry) !== '') {
                    return trim($entry);
                }
            }
        }

        return '';
    }

    // Convoy is reallyy strict (The account password must contain 8 - 50 characters, 1 uppercase, 1 lowercase, 1 number and 1 special character.)
    private function createPassword()
    {
        $password = Str::password();
        while (!preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#\$%\^&\*]).{8,50}$/', $password)) {
            $password = Str::password();
        }

        return $password;
    }

    public function getOrCreateUser($user)
    {
        $users = $this->request('users', data: ['filter[email]' => $user->email]);

        if (count($users['data']) > 0) {
            return [
                'created' => false,
                'id' => $users['data'][0]['id'],
            ];
        }

        $password = $this->createPassword();
        $user = $this->request('users', 'post', [
            'email' => $user->email,
            'name' => $user->name,
            'password' => $password,
            'root_admin' => false,
        ]);

        return [
            'created' => true,
            'id' => $user['data']['id'],
            'password' => $password,
        ];
    }

    /**
     * Create a server
     *
     * @param  array  $settings  (product settings)
     * @param  array  $properties  (checkout options)
     * @return bool
     */
    public function createServer(Service $service, $settings, $properties)
    {
        $node = (int) ($properties['node'] ?? $settings['node']);
        $os = $this->resolveTemplateUuid($node, $properties['install_template_ref'] ?? $properties['os'] ?? null);
        $hostname = $properties['hostname'];
        $password = $properties['account_password']
            ?? $properties['server_password']
            ?? $properties['password']
            ?? $properties['root_password']
            ?? $this->createPassword();
        $cpu = $properties['cpu'] ?? $settings['cpu'];
        $ram = $properties['ram'] ?? $settings['ram'];
        $disk = $properties['disk'] ?? $settings['disk'];
        $bandwidth = $properties['bandwidth'] ?? $settings['bandwidth'];
        $snapshot = $properties['snapshot'] ?? $settings['snapshot'];
        $backups = $properties['backups'] ?? $settings['backups'];
        $ipv4 = $properties['ipv4'] ?? $settings['ipv4'];
        $ipv6 = $properties['ipv6'] ?? $settings['ipv6'];

        $this->assertNodeHasCapacity($node, (int) $ram, (int) $disk);

        $ips = [];
        if ($ipv4 > 0) {
            $ip = $this->request('nodes/' . $node . '/addresses', data: ['filter[server_id]' => '', 'filter[type]' => 'ipv4', 'per_page' => $ipv4]);
            if (count($ip['data'] ?? []) < (int) $ipv4) {
                throw new Exception(sprintf('Node %d does not have enough free IPv4 addresses for this order.', $node));
            }
            $ips = array_merge($ips, array_column($ip['data'], 'id'));
        }
        if ($ipv6 > 0) {
            $ip = $this->request('nodes/' . $node . '/addresses', data: ['filter[server_id]' => '', 'filter[type]' => 'ipv6', 'per_page' => $ipv6]);
            if (count($ip['data'] ?? []) < (int) $ipv6) {
                throw new Exception(sprintf('Node %d does not have enough free IPv6 addresses for this order.', $node));
            }
            $ips = array_merge($ips, array_column($ip['data'], 'id'));
        }

        $user = $this->getOrCreateUser($service->user);

        $data = [
            'node_id' => (int) $node,
            'user_id' => $user['id'],
            'name' => Str::substr($hostname . ' ' . $service->user->name, 0, 40), // The server name must not be greater than 40 characters
            'hostname' => $hostname,
            'vmid' => null,
            'limits' => [
                'cpu' => (int) $cpu,
                'memory' => $ram * 1024 * 1024,
                'disk' => $disk * 1024 * 1024,
                'snapshots' => (int) $snapshot,
                'bandwidth' => (int) $bandwidth == 0 ? null : (int) $bandwidth * 1024 * 1024,
                'backups' => (int) $backups,
                'address_ids' => $ips,
            ],
            'account_password' => $password,
            'template_uuid' => $os,
            'should_create_server' => true,
            'start_on_completion' => isset($properties['start_on_create']) ? (bool) $properties['start_on_create'] : (bool) $settings['start_on_create'],
        ];

        $server = $this->request('servers', 'post', $data);

        if (!isset($server['data'])) {
            throw new Exception('Failed to create server');
        }

        $service->properties()->updateOrCreate([
            'key' => 'server_uuid',
        ], [
            'name' => 'Convoy Server UUID',
            'value' => $server['data']['uuid'],
        ]);

        return [
            'user' => $user,
            'password' => $password,
            'server' => $server['data'],
        ];
    }

    protected function assertNodeHasCapacity(int $nodeId, int $ramMiB, int $diskMiB): void
    {
        $node = $this->resolveNodeRecord($nodeId);
        if ($node === []) {
            return;
        }

        $requestedMemory = max($ramMiB, 0) * 1024 * 1024;
        $requestedDisk = max($diskMiB, 0) * 1024 * 1024;

        $memoryCapacity = $this->resolveNodeCapacityBytes($node['memory'] ?? null, $node['memory_overallocate'] ?? 0);
        $memoryAllocated = $this->normalizeNodeMetric($node['memory_allocated'] ?? null);
        if ($requestedMemory > 0 && $memoryCapacity !== null && $memoryAllocated !== null && ($memoryAllocated + $requestedMemory) > $memoryCapacity) {
            $remainingMiB = max((int) floor(($memoryCapacity - $memoryAllocated) / 1024 / 1024), 0);
            throw new Exception(sprintf(
                'Node %d does not have enough free memory for this order. requested=%d MiB remaining=%d MiB.',
                $nodeId,
                $ramMiB,
                $remainingMiB
            ));
        }

        $diskCapacity = $this->resolveNodeCapacityBytes($node['disk'] ?? null, $node['disk_overallocate'] ?? 0);
        $diskAllocated = $this->normalizeNodeMetric($node['disk_allocated'] ?? null);
        if ($requestedDisk > 0 && $diskCapacity !== null && $diskAllocated !== null && ($diskAllocated + $requestedDisk) > $diskCapacity) {
            $remainingGiB = max((int) floor(($diskCapacity - $diskAllocated) / 1024 / 1024 / 1024), 0);
            throw new Exception(sprintf(
                'Node %d does not have enough free disk for this order. requested=%d GiB remaining=%d GiB.',
                $nodeId,
                $diskMiB / 1024,
                $remainingGiB
            ));
        }
    }

    protected function resolveNodeRecord(int $nodeId): array
    {
        try {
            $payload = $this->request('nodes/' . $nodeId);
            $data = $payload['data'] ?? null;
            if (is_array($data)) {
                return $data;
            }
        } catch (Exception $exception) {
            report($exception);
        }

        try {
            $payload = $this->request('nodes');
            foreach (($payload['data'] ?? []) as $node) {
                if ((int) ($node['id'] ?? 0) === $nodeId && is_array($node)) {
                    return $node;
                }
            }
        } catch (Exception $exception) {
            report($exception);
        }

        return [];
    }

    protected function resolveNodeCapacityBytes(mixed $baseCapacity, mixed $overallocatePercent): ?int
    {
        $base = $this->normalizeNodeMetric($baseCapacity);
        if ($base === null) {
            return null;
        }

        $overallocate = is_numeric($overallocatePercent) ? (float) $overallocatePercent : 0.0;

        return (int) floor($base * (1 + max($overallocate, 0.0) / 100));
    }

    protected function normalizeNodeMetric(mixed $value): ?int
    {
        if (!is_numeric($value)) {
            return null;
        }

        $resolved = (int) $value;

        return $resolved >= 0 ? $resolved : null;
    }

    public function upgradeServer(Service $service, $settings, $properties)
    {
        if (!isset($properties['server_uuid'])) {
            throw new Exception('Server does not exist');
        }

        $currentData = $this->request('servers/' . $properties['server_uuid']);

        $data = [
            'address_ids' => [],
            'snapshot_limit' => (int) ($properties['snapshot'] ?? $settings['snapshot']),
            'backup_limit' => (int) ($properties['backups'] ?? $settings['backups']),
            'bandwidth_limit' => (int) ($properties['bandwidth'] ?? $settings['bandwidth']) * 1024 * 1024,
            'cpu' => (int) ($properties['cpu'] ?? $settings['cpu']),
            'memory' => (int) ($properties['ram'] ?? $settings['ram']) * 1024 * 1024,
            'disk' => (int) ($properties['disk'] ?? $settings['disk']) * 1024 * 1024,
        ];

        $limitIpv4 = (int) ($properties['ipv4'] ?? $settings['ipv4']);
        $limitIpv6 = (int) ($properties['ipv6'] ?? $settings['ipv6']);
        // Check if IPv4 has increased
        if ($limitIpv4 && $limitIpv4 > count($currentData['data']['limits']['addresses']['ipv4'])) {
            $ip = $this->request('nodes/' . $currentData['data']['node_id'] . '/addresses', data: ['filter[server_id]' => '', 'filter[type]' => 'ipv4', 'per_page' => $limitIpv4 - count($currentData['data']['limits']['addresses']['ipv4'])]);
            $data['address_ids'] = array_merge(array_column($currentData['data']['limits']['addresses']['ipv4'], 'id'), array_column($ip['data'], 'id'));
        } else {
            $data['address_ids'] = array_column($currentData['data']['limits']['addresses']['ipv4'], 'id');
        }
        // Check if IPv6 has increased
        if ($limitIpv6 && $limitIpv6 > count($currentData['data']['limits']['addresses']['ipv6'])) {
            $ip = $this->request('nodes/' . $currentData['data']['node_id'] . '/addresses', data: ['filter[server_id]' => '', 'filter[type]' => 'ipv6', 'per_page' => $limitIpv6 - count($currentData['data']['limits']['addresses']['ipv6'])]);
            $data['address_ids'] = array_merge($data['address_ids'], array_column($ip['data'], 'id'));
        } else {
            $data['address_ids'] = array_merge($data['address_ids'], array_column($currentData['data']['limits']['addresses']['ipv6'], 'id'));
        }
        $data['address_ids'] = array_values(array_unique($data['address_ids']));

        // Update server
        $server = $this->request('servers/' . $properties['server_uuid'] . '/settings/build', 'patch', $data);
        if (!isset($server['data'])) {
            throw new Exception('Failed to update server');
        }

        return [
            'server' => $server['data'],
        ];
    }

    /**
     * Suspend a server
     *
     * @param  array  $settings  (product settings)
     * @param  array  $properties  (checkout options)
     * @return bool
     */
    public function suspendServer(Service $service, $settings, $properties)
    {
        if (!isset($properties['server_uuid'])) {
            throw new Exception('Server does not exist');
        }

        $this->request('servers/' . $properties['server_uuid'] . '/settings/suspend', 'post');
    }

    /**
     * Unsuspend a server
     *
     * @param  array  $settings  (product settings)
     * @param  array  $properties  (checkout options)
     * @return bool
     */
    public function unsuspendServer(Service $service, $settings, $properties)
    {
        if (!isset($properties['server_uuid'])) {
            throw new Exception('Server does not exist');
        }

        $this->request('servers/' . $properties['server_uuid'] . '/settings/unsuspend', 'post');
    }

    /**
     * Terminate a server
     *
     * @param  array  $settings  (product settings)
     * @param  array  $properties  (checkout options)
     * @return bool
     */
    public function terminateServer(Service $service, $settings, $properties)
    {
        if (!isset($properties['server_uuid'])) {
            throw new Exception('Server does not exist');
        }

        $this->request('servers/' . $properties['server_uuid'], 'delete');

        // Remove the server_uuid property
        $service->properties()->where('key', 'server_uuid')->delete();
    }

    public function getActions(Service $service): array
    {
        return [
            [
                'type' => 'button',
                'label' => 'Go to Server',
                'function' => 'ssoLink',
            ],
        ];
    }

    public function getServer(string $serverRef): array
    {
        return $this->request('servers/' . $serverRef);
    }

    public function rotateServerPassword(string $serverRef, string $password): array
    {
        return $this->request('servers/' . $serverRef . '/settings/password', 'post', [
            'password' => $password,
            'account_password' => $password,
        ]);
    }

    public function ssoLink(Service $service): string
    {
        $data = $this->request('users/' . $this->getOrCreateUser($service->user)['id'] . '/generate-sso-token', 'post');

        return rtrim($this->config('host'), '/') . '/authenticate?token=' . $data['data']['token'];
    }
}
