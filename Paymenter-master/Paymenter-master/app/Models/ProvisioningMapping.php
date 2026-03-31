<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class ProvisioningMapping extends Model
{
    use HasFactory;

    protected $fillable = [
        'provider',
        'product_id',
        'product_slug',
        'plan_id',
        'plan_name',
        'template_ref',
        'node_ref',
        'config',
        'priority',
        'enabled',
    ];

    protected $casts = [
        'config' => 'array',
        'enabled' => 'boolean',
    ];

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('enabled', true);
    }
}
