<?php

namespace App\Admin\Clusters;

use App\Models\Invoice;
use Filament\Clusters\Cluster;

class InvoiceCluster extends Cluster
{
    protected static string|\BackedEnum|null $navigationIcon = 'ri-receipt-line';

    protected static string|\BackedEnum|null $activeNavigationIcon = 'ri-receipt-fill';

    public static function getNavigationBadge(): ?string
    {
        return Invoice::where('status', 'pending')->count() ?: null;
    }

    public static function getNavigationBadgeColor(): ?string
    {
        return 'warning';
    }

    public static function getNavigationGroup(): ?string
    {
        return admin_t('sloth-admin.groups.administration', 'Administration');
    }

    public static function getNavigationLabel(): string
    {
        return admin_t('sloth-admin.resources.invoice.navigation', 'Invoices');
    }
}
