<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VpsAppInstall extends Model
{
    use HasFactory;

    public const STATUS_PENDING = 'pending';

    public const STATUS_QUEUED = 'queued';

    public const STATUS_INSTALLING = 'installing';

    public const STATUS_READY = 'ready';

    public const STATUS_FAILED = 'failed';

    public const STATUS_RETRYING = 'retrying';

    protected $guarded = [];

    protected $casts = [
        'logs' => 'array',
        'request_payload' => 'array',
        'response_payload' => 'array',
        'is_primary' => 'bool',
        'started_at' => 'datetime',
        'last_attempt_at' => 'datetime',
        'completed_at' => 'datetime',
        'installed_at' => 'datetime',
    ];

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    public function app(): BelongsTo
    {
        return $this->belongsTo(VpsApp::class, 'vps_app_id');
    }

    public function recipe(): BelongsTo
    {
        return $this->belongsTo(VpsAppRecipe::class, 'vps_app_recipe_id');
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    /**
     * @return array<int, string>
     */
    public static function activeStatuses(): array
    {
        return [
            self::STATUS_PENDING,
            self::STATUS_QUEUED,
            self::STATUS_INSTALLING,
            self::STATUS_RETRYING,
        ];
    }
}
