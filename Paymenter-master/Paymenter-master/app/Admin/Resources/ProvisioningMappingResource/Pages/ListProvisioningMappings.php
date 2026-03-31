<?php

namespace App\Admin\Resources\ProvisioningMappingResource\Pages;

use App\Admin\Resources\ProvisioningMappingResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListProvisioningMappings extends ListRecords
{
    protected static string $resource = ProvisioningMappingResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}

