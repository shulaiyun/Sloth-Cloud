<?php

namespace Convoy\Services\Servers;

use Convoy\Models\Server;
use Convoy\Repositories\Proxmox\Server\ProxmoxConfigRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxGuestAgentRepository;
use Illuminate\Support\Str;

class ServerAuthService
{
    public function __construct(private ProxmoxConfigRepository $configRepository, private ProxmoxGuestAgentRepository $guestAgentRepository)
    {
    }

    /**
     * @return array{
     *     password: string,
     *     password_apply_mode: string,
     *     applied_live: bool,
     *     restart_required: bool,
     *     login_username: string|null,
     *     os_name: string|null,
     *     note: string
     * }
     */
    public function updatePassword(Server $server, string $password): array
    {
        $result = [
            'password' => $password,
            'password_apply_mode' => 'cloud-init',
            'applied_live' => false,
            'restart_required' => true,
            'login_username' => null,
            'os_name' => null,
            'note' => 'Password stored in cloud-init configuration. Restart the server to apply it inside the guest OS.',
        ];

        // Always store CIPassword first
        $this->configRepository->setServer($server)->update(['cipassword' => $password]);

        try {
            $osInfo = $this->guestAgentRepository->setServer($server)->guestAgentOs();

            // If we have valid OS info, decide which username to use
            if (is_array($osInfo) && isset($osInfo['result']['name'])) {
                $osName = $osInfo['result']['name'];
                $username = Str::contains(Str::lower($osName), 'windows') ? 'Administrator' : 'root';
                $result['os_name'] = $osName;
                $result['login_username'] = $username;

                $this->guestAgentRepository
                    ->setServer($server)
                    ->updateGuestAgentPassword($username, $password);

                $result['password_apply_mode'] = 'guest-agent';
                $result['applied_live'] = true;
                $result['restart_required'] = false;
                $result['note'] = sprintf(
                    'Password was updated live through the guest agent for user %s.',
                    $username
                );
            }
        } catch (\Throwable $e) {
            report($e);
        }

        return $result;
    }

    public function getSSHKeys(Server $server): string
    {
        $raw = collect($this->configRepository->setServer($server)->getConfig())->where('key', '=', 'sshkeys')->first()['value'] ?? '';

        return rawurldecode($raw);
    }

    public function updateSSHKeys(Server $server, ?string $keys): void
    {
        if (! empty($keys)) {
            $this->configRepository->setServer($server)->update(['sshkeys' => rawurlencode($keys)]);
        } else {
            $this->configRepository->setServer($server)->update(['delete' => 'sshkeys']);
        }
    }
}
