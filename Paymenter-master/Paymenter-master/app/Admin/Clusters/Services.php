<?php

namespace App\Admin\Clusters;

use Filament\Clusters\Cluster;

class Services extends Cluster
{
    protected static string|\BackedEnum|null $navigationIcon = 'ri-archive-stack-line';

    protected static string|\BackedEnum|null $activeNavigationIcon = 'ri-archive-stack-fill';

    protected static ?int $navigationSort = 0;

    protected static ?string $slug = 'services';

    public static function getNavigationGroup(): ?string
    {
        return admin_t('sloth-admin.groups.administration', 'Administration');
    }

    public static function getNavigationLabel(): string
    {
        return admin_t('sloth-admin.resources.service.navigation', 'Services');
    }
}
