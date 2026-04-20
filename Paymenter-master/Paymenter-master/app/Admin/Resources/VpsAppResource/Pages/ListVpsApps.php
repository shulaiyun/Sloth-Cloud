<?php

namespace App\Admin\Resources\VpsAppResource\Pages;

use App\Admin\Resources\VpsAppResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListVpsApps extends ListRecords
{
    protected static string $resource = VpsAppResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
