<?php

namespace App\Admin\Resources\VpsAppCategoryResource\Pages;

use App\Admin\Resources\VpsAppCategoryResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListVpsAppCategories extends ListRecords
{
    protected static string $resource = VpsAppCategoryResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
