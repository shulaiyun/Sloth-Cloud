<?php

namespace Convoy\Services\Servers;

use Convoy\Data\Server\Eloquent\AddressData;
use Convoy\Data\Server\Eloquent\ServerAddressesData;
use Convoy\Data\Server\MacAddressData;
use Convoy\Enums\Network\AddressType;
use Convoy\Models\Address;
use Convoy\Models\Server;
use Convoy\Repositories\Eloquent\AddressRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxCloudinitRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxConfigRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxFirewallRepository;
use Illuminate\Support\Arr;
use function collect;
use function count;
use function implode;
use function is_null;
use function preg_match;
use function sprintf;
use function strtolower;
use function trim;

class NetworkService
{
    public function __construct(
        private AddressRepository          $repository,
        private ProxmoxFirewallRepository  $firewallRepository,
        private CloudinitService           $cloudinitService,
        private ProxmoxCloudinitRepository $cloudinitRepository,
        private ProxmoxConfigRepository    $allocationRepository,
    ) {
    }

    public function deleteIpset(Server $server, string $name)
    {
        $this->firewallRepository->setServer($server);

        $addresses = array_column($this->firewallRepository->getLockedIps($name), 'cidr');

        foreach ($addresses as $address) {
            $this->firewallRepository->unlockIp($name, $address);
        }

        return $this->firewallRepository->deleteIpset($name);
    }

    public function clearIpsets(Server $server): void
    {
        $this->firewallRepository->setServer($server);

        $ipSets = array_column($this->firewallRepository->getIpsets(), 'name');

        foreach ($ipSets as $ipSet) {
            $this->deleteIpset($server, $ipSet);
        }
    }

    public function lockIps(Server $server, array $addresses, string $ipsetName): void
    {
        $this->firewallRepository->setServer($server);

        $this->firewallRepository->createIpset($ipsetName);

        foreach ($addresses as $address) {
            $this->firewallRepository->lockIp($ipsetName, $address);
        }
    }

    public function getMacAddresses(Server $server, bool $eloquent = true, bool $proxmox = false): MacAddressData
    {
        if ($eloquent) {
            $addresses = $this->getAddresses($server);

            $eloquentMacAddress = $addresses->ipv4->first(
            )?->mac_address ?? $addresses->ipv6->first()?->mac_address;
        }

        if ($proxmox) {
            $config = $this->cloudinitRepository->setServer($server)->getConfig();

            $proxmoxMacAddress = null;
            if (preg_match(
                "/\b[[:xdigit:]]{2}:[[:xdigit:]]{2}:[[:xdigit:]]{2}:[[:xdigit:]]{2}:[[:xdigit:]]{2}:[[:xdigit:]]{2}\b/su",
                Arr::get($config, 'net0', ''),
                $matches,
            )) {
                $proxmoxMacAddress = $matches[0];
            }
        }

        return MacAddressData::from([
            'eloquent' => $eloquentMacAddress ?? null,
            'proxmox' => $proxmoxMacAddress ?? null,
        ]);
    }

    public function getAddresses(Server $server): ServerAddressesData
    {
        return ServerAddressesData::from([
            'ipv4' => array_values(
                $server->addresses->where('type', AddressType::IPV4->value)->toArray(),
            ),
            'ipv6' => array_values(
                $server->addresses->where('type', AddressType::IPV6->value)->toArray(),
            ),
        ]);
    }

    public function syncSettings(Server $server): void
    {
        $macAddresses = $this->getMacAddresses($server, true, true);
        $addresses = $this->getAddresses($server);
        $interfaceConfigs = $this->buildInterfaceConfigs($server, $addresses, $macAddresses);
        $desiredNetworkKeys = [];
        $networkPayload = [];

        $this->clearIpsets($server);

        foreach ($interfaceConfigs as $config) {
            $index = (int) $config['index'];
            $netKey = "net{$index}";
            $ipConfigKey = "ipconfig{$index}";

            $desiredNetworkKeys[] = $netKey;
            $desiredNetworkKeys[] = $ipConfigKey;
            $networkPayload[$netKey] = (string) $config['net'];
            $networkPayload[$ipConfigKey] = (string) $config['ipconfig'];

            if (!empty($config['locked'])) {
                $this->lockIps(
                    $server,
                    $config['locked'],
                    "ipfilter-net{$index}",
                );
            }
        }

        $this->firewallRepository->setServer($server)->updateOptions([
            'enable' => true,
            'ipfilter' => true,
            'policy_in' => 'ACCEPT',
            'policy_out' => 'ACCEPT',
        ]);

        $rawConfig = $this->allocationRepository->setServer($server)->getConfig();
        $existingNetworkKeys = collect($rawConfig)
            ->pluck('key')
            ->filter(fn ($key) => preg_match('/^(net|ipconfig)\d+$/', (string) $key))
            ->values()
            ->all();
        $keysToDelete = array_values(array_diff($existingNetworkKeys, $desiredNetworkKeys));

        if (!empty($keysToDelete)) {
            $networkPayload['delete'] = implode(',', $keysToDelete);
        }

        $this->allocationRepository->setServer($server)->update($networkPayload);
    }

    private function buildInterfaceConfigs(Server $server, ServerAddressesData $addresses, MacAddressData $macAddresses): array
    {
        /** @var array<int, AddressData> $ipv4List */
        $ipv4List = array_values($addresses->ipv4->all());
        /** @var array<int, AddressData> $ipv6List */
        $ipv6List = array_values($addresses->ipv6->all());

        $count = max(count($ipv4List), count($ipv6List), 1);
        $fallbackPrimaryMac = $this->normalizeMac($macAddresses->eloquent ?? $macAddresses->proxmox);
        $configs = [];

        for ($index = 0; $index < $count; $index++) {
            $ipv4 = $ipv4List[$index] ?? null;
            $ipv6 = $ipv6List[$index] ?? null;
            $mac = $this->resolveInterfaceMac($server, $index, $ipv4, $ipv6, $fallbackPrimaryMac);
            $ipConfigParts = [];
            $locked = [];

            if ($ipv4) {
                $ipConfigParts[] = "ip={$ipv4->address}/{$ipv4->cidr}";
                if ($index === 0 && trim($ipv4->gateway) !== '') {
                    $ipConfigParts[] = "gw={$ipv4->gateway}";
                }
                $locked[] = $ipv4->address;
            }

            if ($ipv6) {
                $ipConfigParts[] = "ip6={$ipv6->address}/{$ipv6->cidr}";
                if ($index === 0 && trim($ipv6->gateway) !== '') {
                    $ipConfigParts[] = "gw6={$ipv6->gateway}";
                }
                $locked[] = $ipv6->address;
            }

            if (empty($ipConfigParts) && $index === 0) {
                $ipConfigParts[] = 'ip=dhcp';
            }

            $configs[] = [
                'index' => $index,
                'net' => "virtio={$mac},bridge={$server->node->network},firewall=1",
                'ipconfig' => implode(',', $ipConfigParts),
                'locked' => $locked,
            ];
        }

        return $configs;
    }

    private function resolveInterfaceMac(
        Server $server,
        int $index,
        ?AddressData $ipv4,
        ?AddressData $ipv6,
        ?string $fallbackPrimaryMac,
    ): string {
        $candidate = $this->normalizeMac($ipv4?->mac_address ?? $ipv6?->mac_address);
        if ($candidate) {
            return $candidate;
        }

        if ($index === 0 && $fallbackPrimaryMac) {
            return $fallbackPrimaryMac;
        }

        return $this->deterministicMac($server, $index);
    }

    private function normalizeMac(?string $mac): ?string
    {
        $candidate = strtolower(trim((string) $mac));
        if ($candidate === '') {
            return null;
        }

        return preg_match('/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/', $candidate) === 1
            ? $candidate
            : null;
    }

    private function deterministicMac(Server $server, int $index): string
    {
        $seed = md5($server->uuid.'-'.$index);
        $octets = [];

        for ($i = 0; $i < 6; $i++) {
            $octets[$i] = hexdec(substr($seed, $i * 2, 2));
        }

        // Force locally administered unicast MAC.
        $octets[0] = ($octets[0] & 0b11111110) | 0b00000010;

        return implode(':', array_map(fn ($octet) => sprintf('%02x', $octet), $octets));
    }

    public function updateRateLimit(Server $server, ?int $mebibytes = null): void
    {
        $macAddresses = $this->getMacAddresses($server, true, true);
        $macAddress = $macAddresses->eloquent ?? $macAddresses->proxmox;
        $rawConfig = $this->allocationRepository->setServer($server)->getConfig();
        $networkConfig = collect($rawConfig)->where('key', '=', 'net0')->first();

        if (is_null($networkConfig)) {
            return;
        }

        $parsedConfig = $this->parseConfig($networkConfig['value']);

        // List of possible models
        $models = ['e1000', 'e1000-82540em', 'e1000-82544gc', 'e1000-82545em', 'e1000e', 'i82551', 'i82557b', 'i82559er', 'ne2k_isa', 'ne2k_pci', 'pcnet', 'rtl8139', 'virtio', 'vmxnet3'];

        // Update the model with the new MAC address
        $modelFound = false;
        foreach ($parsedConfig as $item) {
            if (in_array($item->key, $models)) {
                $item->value = $macAddress;
                $modelFound = true;
                break;
            }
        }

        // If no model key exists, add the default model with the MAC address
        if (!$modelFound) {
            $parsedConfig[] = (object) ['key' => 'virtio', 'value' => $macAddress];
        }

        // Update or create the bridge value
        $bridgeFound = false;
        foreach ($parsedConfig as $item) {
            if ($item->key === 'bridge') {
                $item->value = $server->node->network;
                $bridgeFound = true;
                break;
            }
        }

        if (!$bridgeFound) {
            $parsedConfig[] = (object) ['key' => 'bridge', 'value' => $server->node->network];
        }

        // Update or create the firewall key
        $firewallFound = false;
        foreach ($parsedConfig as $item) {
            if ($item->key === 'firewall') {
                $item->value = 1;
                $firewallFound = true;
                break;
            }
        }

        if (!$firewallFound) {
            $parsedConfig[] = (object) ['key' => 'firewall', 'value' => 1];
        }

        // Handle the rate limit
        if (is_null($mebibytes)) {
            // Remove the 'rate' key if $mebibytes is null
            $parsedConfig = array_filter($parsedConfig, fn ($item) => $item->key !== 'rate');
        } else {
            // Add or update the 'rate' key
            $rateUpdated = false;
            foreach ($parsedConfig as $item) {
                if ($item->key === 'rate') {
                    $item->value = $mebibytes;
                    $rateUpdated = true;
                    break;
                }
            }

            if (!$rateUpdated) {
                $parsedConfig[] = (object) ['key' => 'rate', 'value' => $mebibytes];
            }
        }

        // Rebuild the configuration string
        $newConfig = implode(',', array_map(fn ($item) => "{$item->key}={$item->value}", $parsedConfig));

        // Update the Proxmox configuration
        $this->allocationRepository->setServer($server)->update(['net0' => $newConfig]);
    }

    private function parseConfig(string $config): array
    {
        // Split components by commas
        $components = explode(',', $config);

        // Array to hold the parsed objects
        $parsedObjects = [];

        foreach ($components as $component) {
            // Split each component into key and value
            [$key, $value] = explode('=', $component);

            // Create an associative array (or object) for key-value pairs
            $parsedObjects[] = (object) ['key' => $key, 'value' => $value];
        }

        return $parsedObjects;
    }

    public function updateAddresses(Server $server, array $addressIds): void
    {
        $currentAddresses = $server->addresses()->get()->pluck('id')->toArray();

        $addressesToAdd = array_diff($addressIds, $currentAddresses);
        $addressesToRemove = array_filter(
            $currentAddresses,
            fn ($id) => !in_array($id, $addressIds),
        );

        if (!empty($addressesToAdd)) {
            $this->repository->attachAddresses($server, $addressesToAdd);
        }

        if (!empty($addressesToRemove)) {
            Address::query()
                   ->where('server_id', $server->id)
                   ->whereIn('id', $addressesToRemove)
                   ->update(['server_id' => null]);
        }
    }
}
