<?php

namespace Convoy\Http\Controllers\Admin;

use Convoy\Enums\Server\Status;
use Convoy\Enums\Server\PowerAction;
use Convoy\Enums\Server\SuspensionAction;
use Convoy\Exceptions\Repository\Proxmox\ProxmoxConnectionException;
use Convoy\Http\Controllers\ApiController;
use Convoy\Data\Server\Deployments\ServerDeploymentData;
use Convoy\Models\Template;
use Convoy\Http\Requests\Admin\Servers\Settings\UpdateBuildRequest;
use Convoy\Http\Requests\Admin\Servers\Settings\RotatePasswordRequest;
use Convoy\Http\Requests\Admin\Servers\Settings\ReinstallServerRequest;
use Convoy\Http\Requests\Admin\Servers\Settings\UpdateGeneralInfoRequest;
use Convoy\Http\Requests\Admin\Servers\SendPowerCommandRequest;
use Convoy\Http\Requests\Admin\Servers\StoreServerRequest;
use Convoy\Models\Filters\FiltersServerByAddressPoolId;
use Convoy\Models\Filters\FiltersServerWildcard;
use Convoy\Models\Server;
use Convoy\Services\Servers\CloudinitService;
use Convoy\Services\Servers\NetworkService;
use Convoy\Services\Servers\ServerAuthService;
use Convoy\Services\Servers\ServerCreationService;
use Convoy\Services\Servers\ServerDeletionService;
use Convoy\Services\Servers\ServerBuildDispatchService;
use Convoy\Services\Servers\ServerSuspensionService;
use Convoy\Services\Servers\SyncBuildService;
use Convoy\Repositories\Proxmox\Server\ProxmoxPowerRepository;
use Convoy\Transformers\Admin\ServerBuildTransformer;
use Illuminate\Http\JsonResponse;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;
use Symfony\Component\HttpKernel\Exception\ServiceUnavailableHttpException;

class ServerController extends ApiController
{
    public function __construct(
        private ConnectionInterface     $connection,
        private ServerDeletionService   $deletionService,
        private NetworkService          $networkService,
        private ProxmoxPowerRepository  $powerRepository,
        private ServerSuspensionService $suspensionService,
        private ServerCreationService   $creationService,
        private ServerBuildDispatchService $buildDispatchService,
        private ServerAuthService       $authService,
        private CloudinitService        $cloudinitService,
        private SyncBuildService        $buildModificationService,
    )
    {
    }

    public function index(Request $request)
    {
        $servers = QueryBuilder::for(Server::query())
                               ->with(['addresses', 'user', 'node'])
                               ->defaultSort('-id')
                               ->allowedFilters(
                                   [
                                       AllowedFilter::custom(
                                           '*', new FiltersServerWildcard(),
                                       ),
                                       AllowedFilter::custom(
                                           'address_pool_id',
                                           new FiltersServerByAddressPoolId(),
                                       ),
                                       AllowedFilter::exact('node_id'),
                                       AllowedFilter::exact('user_id'),
                                       'name',
                                   ],
                               )
                               ->paginate(min($request->query('per_page', 50), 100))->appends(
                $request->query(),
            );

        return fractal($servers, new ServerBuildTransformer())->parseIncludes($request->include)
                                                              ->respond();
    }

    public function show(Request $request, Server $server)
    {
        $server->load(['addresses', 'user', 'node']);

        return fractal($server, new ServerBuildTransformer())->parseIncludes($request->include)
                                                             ->respond();
    }

    public function store(StoreServerRequest $request)
    {
        $server = $this->creationService->handle($request->validated());

        $server->load(['addresses', 'user', 'node']);

        return fractal($server, new ServerBuildTransformer())->parseIncludes(['user', 'node'])
                                                             ->respond();
    }

    public function update(UpdateGeneralInfoRequest $request, Server $server)
    {
        $this->connection->transaction(function () use ($request, $server) {
            if ($request->hostname !== $server->hostname && !empty($request->hostname)) {
                try {
                    $this->cloudinitService->updateHostname($server, $request->hostname);
                } catch (ProxmoxConnectionException) {
                    throw new ServiceUnavailableHttpException(
                        message: "Server {$server->uuid} failed to sync hostname.",
                    );
                }
            }

            $server->update($request->validated());
        });

        $server->load(['addresses', 'user', 'node']);

        return fractal($server, new ServerBuildTransformer())->parseIncludes(['user', 'node'])
                                                             ->respond();
    }

    public function updateBuild(UpdateBuildRequest $request, Server $server)
    {
        $server->update($request->safe()->except('address_ids'));

        $this->networkService->updateAddresses($server, $request->address_ids ?? []);

        try {
            $this->buildModificationService->handle($server);
        } catch (ProxmoxConnectionException $e) {
            // do nothing
        }

        $server->load(['addresses', 'user', 'node']);

        return fractal($server, new ServerBuildTransformer())->parseIncludes(['user', 'node'])
                                                             ->respond();
    }

    public function suspend(Server $server)
    {
        $this->suspensionService->toggle($server);

        return $this->returnNoContent();
    }

    public function unsuspend(Server $server)
    {
        $this->suspensionService->toggle($server, SuspensionAction::UNSUSPEND);

        return $this->returnNoContent();
    }

    public function destroy(Request $request, Server $server)
    {
        $this->connection->transaction(function () use ($server, $request) {
            $server->update(['status' => Status::DELETING->value]);

            $this->deletionService->handle($server, $request->input('no_purge', false));
        });

        return $this->returnNoContent();
    }

    public function power(Server $server, SendPowerCommandRequest $request)
    {
        $action = $request->enum('state', PowerAction::class);
        $this->powerRepository->setServer($server)->send($action);

        return $this->returnNoContent();
    }

    public function reinstall(ReinstallServerRequest $request, Server $server)
    {
        $this->connection->transaction(function () use ($request, $server) {
            $server->update(['status' => Status::INSTALLING->value]);

            $deployment = ServerDeploymentData::from([
                'server' => $server,
                'template' => Template::where('uuid', '=', $request->template_uuid)->firstOrFail(),
                'account_password' => $request->account_password,
                'should_create_server' => true,
                'start_on_completion' => $request->boolean('start_on_completion'),
            ]);

            $this->buildDispatchService->rebuild($deployment);
        });

        return $this->returnNoContent();
    }

    public function rotatePassword(RotatePasswordRequest $request, Server $server): JsonResponse
    {
        $password = trim((string) $request->input('password', ''));
        if ($password === '') {
            $password = $this->createPassword();
        }

        $this->authService->updatePassword($server, $password);

        return new JsonResponse([
            'data' => [
                'password' => $password,
            ],
        ]);
    }

    protected function createPassword(): string
    {
        $password = Str::password();
        while (!preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#\$%\^&\*]).{8,191}$/', $password)) {
            $password = Str::password();
        }

        return $password;
    }
}
