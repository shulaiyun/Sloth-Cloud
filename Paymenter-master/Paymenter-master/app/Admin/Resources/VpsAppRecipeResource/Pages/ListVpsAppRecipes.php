<?php

namespace App\Admin\Resources\VpsAppRecipeResource\Pages;

use App\Admin\Resources\VpsAppRecipeResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListVpsAppRecipes extends ListRecords
{
    protected static string $resource = VpsAppRecipeResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
