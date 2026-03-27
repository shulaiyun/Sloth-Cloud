<?php

namespace App\Admin\Resources\ProductResource\Pages;

use App\Admin\Resources\ProductResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListProducts extends ListRecords
{
    protected static string $resource = ProductResource::class;

    public function getTitle(): string
    {
        return admin_t('sloth-admin.resources.product.navigation', 'Products');
    }

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
