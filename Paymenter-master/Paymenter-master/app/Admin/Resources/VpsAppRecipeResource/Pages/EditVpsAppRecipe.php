<?php

namespace App\Admin\Resources\VpsAppRecipeResource\Pages;

use App\Admin\Resources\VpsAppRecipeResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;

class EditVpsAppRecipe extends EditRecord
{
    protected static string $resource = VpsAppRecipeResource::class;

    protected function getHeaderActions(): array
    {
        return [
            DeleteAction::make(),
        ];
    }
}
