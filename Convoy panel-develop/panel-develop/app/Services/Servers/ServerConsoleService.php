<?php

namespace Convoy\Services\Servers;

use Exception;
use Convoy\Models\Server;
use Convoy\Enums\Node\Access\RealmType;
use Convoy\Data\Node\Access\CreateUserData;
use Convoy\Data\Node\Access\UserCredentialsData;
use Convoy\Data\Server\Proxmox\Console\NoVncCredentialsData;
use Convoy\Data\Server\Proxmox\Console\XTermCredentialsData;
use Convoy\Repositories\Proxmox\Node\ProxmoxAccessRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxServerRepository;
use Convoy\Repositories\Proxmox\Server\ProxmoxConsoleRepository;

class ServerConsoleService
{
    private const CONSOLE_ROLE = 'convoy-console';
    private const CONSOLE_ROLE_PRIVILEGES = 'VM.Audit,VM.Console,VM.PowerMgmt';

    public function __construct(private ProxmoxServerRepository $serverRepository, private ProxmoxAccessRepository $accessRepository, private ProxmoxConsoleRepository $consoleRepository)
    {
    }

    public function createConsoleUserCredentials(Server $server): UserCredentialsData
    {
        $this->accessRepository->setServer($server);
        $this->serverRepository->setServer($server);

        $user = $this->accessRepository->createUser(CreateUserData::from([
            'realm_type' => 'pve',
            'enabled' => true,
            'expires_at' => now()->addDay(),
        ]));

        $this->ensureConsoleRole();

        $this->serverRepository->addUser(
            RealmType::PVE,
            $user->username,
            self::CONSOLE_ROLE
        );

        return $this->accessRepository->createUserCredentials(RealmType::PVE, $user->username, $user->password);
    }

    private function ensureConsoleRole(): void
    {
        try {
            $this->accessRepository->createRole(self::CONSOLE_ROLE, self::CONSOLE_ROLE_PRIVILEGES);

            return;
        } catch (Exception) {
            // Fall through and try to align privileges on an existing role.
        }

        try {
            $this->accessRepository->updateRole(self::CONSOLE_ROLE, self::CONSOLE_ROLE_PRIVILEGES);
        } catch (Exception) {
        }
    }

    public function createNoVncCredentials(Server $server): NoVncCredentialsData
    {
        $credentials = $this->createConsoleUserCredentials($server);

        return $this->consoleRepository->setServer($server)->createNoVncCredentials($credentials);
    }

    public function createXTermjsCredentials(Server $server): XTermCredentialsData
    {
        $credentials = $this->createConsoleUserCredentials($server);

        return $this->consoleRepository->setServer($server)->createXTermjsCredentials($credentials);
    }
}
