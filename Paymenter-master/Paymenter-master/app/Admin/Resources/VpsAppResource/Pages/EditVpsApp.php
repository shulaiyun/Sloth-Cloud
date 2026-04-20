<?php

namespace App\Admin\Resources\VpsAppResource\Pages;

use App\Admin\Resources\VpsAppResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;

class EditVpsApp extends EditRecord
{
    protected static string $resource = VpsAppResource::class;

    protected function getHeaderActions(): array
    {
        return [
            DeleteAction::make(),
        ];
    }
}
