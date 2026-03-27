<?php

namespace App\Admin\Pages;

use Filament\Pages\Dashboard as BaseDashboard;

class Dashboard extends BaseDashboard
{
    protected static string|\BackedEnum|null $navigationIcon = 'ri-function-line';

    protected static string|\BackedEnum|null $activeNavigationIcon = 'ri-function-fill';

    public static function getNavigationLabel(): string
    {
        return admin_t('sloth-admin.pages.dashboard', 'Dashboard');
    }

    public function getTitle(): string
    {
        return admin_t('sloth-admin.pages.dashboard', 'Dashboard');
    }
}
