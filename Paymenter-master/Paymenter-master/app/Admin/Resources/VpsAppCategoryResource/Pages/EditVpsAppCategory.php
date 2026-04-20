<?php

namespace App\Admin\Resources\VpsAppCategoryResource\Pages;

use App\Admin\Resources\VpsAppCategoryResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;

class EditVpsAppCategory extends EditRecord
{
    protected static string $resource = VpsAppCategoryResource::class;

    protected function getHeaderActions(): array
    {
        return [
            DeleteAction::make(),
        ];
    }
}
