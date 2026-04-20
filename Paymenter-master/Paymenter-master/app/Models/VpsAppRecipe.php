<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VpsAppRecipe extends Model
{
    use HasFactory;

    public const STRATEGY_TEMPLATE = 'template';

    public const STRATEGY_SCRIPT = 'script';

    public const STRATEGY_HYBRID = 'hybrid';

    protected $guarded = [];

    protected $casts = [
        'dependencies' => 'array',
        'conflicts' => 'array',
        'allow_on_existing_service' => 'bool',
        'enabled' => 'bool',
    ];

    public function app(): BelongsTo
    {
        return $this->belongsTo(VpsApp::class, 'vps_app_id');
    }
}
