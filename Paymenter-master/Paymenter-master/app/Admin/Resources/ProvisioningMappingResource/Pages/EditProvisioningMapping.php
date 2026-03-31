<?php

namespace App\Admin\Resources\ProvisioningMappingResource\Pages;

use App\Admin\Resources\ProvisioningMappingResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;

class EditProvisioningMapping extends EditRecord
{
    protected static string $resource = ProvisioningMappingResource::class;

    protected function getHeaderActions(): array
    {
        return [
            DeleteAction::make(),
        ];
    }
}

