<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class VpsApp extends Model
{
    use HasFactory;

    public const TYPE_MAIN = 'main';

    public const TYPE_ADDON = 'addon';

    protected $guarded = [];

    protected $casts = [
        'search_keywords' => 'array',
        'featured' => 'bool',
        'enabled' => 'bool',
        'allow_on_existing_service' => 'bool',
    ];

    public function category(): BelongsTo
    {
        return $this->belongsTo(VpsAppCategory::class, 'vps_app_category_id');
    }

    public function recipes(): HasMany
    {
        return $this->hasMany(VpsAppRecipe::class)->orderBy('sort')->orderBy('id');
    }

    public function installs(): HasMany
    {
        return $this->hasMany(VpsAppInstall::class);
    }
}
