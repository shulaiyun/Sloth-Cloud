<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;

class ProvisioningJob extends Model
{
    use HasFactory;

    public const STATUS_PENDING = 'pending';

    public const STATUS_QUEUED = 'queued';

    public const STATUS_BUILDING = 'building';

    public const STATUS_PUSHING = 'pushing';

    public const STATUS_DEPLOYING = 'deploying';

    public const STATUS_READY = 'ready';

    public const STATUS_FAILED = 'failed';

    public const STATUS_RETRYING = 'retrying';

    public const STATUS_DELETING = 'deleting';

    // Legacy aliases kept for backward-compatible reads and comparisons.
    public const STATUS_PROVISIONING = 'provisioning';

    public const STATUS_SUCCESS = 'success';

    protected $fillable = [
        'service_id',
        'provider',
        'status',
        'attempt_count',
        'request_payload',
        'response_payload',
        'error_message',
        'last_attempt_at',
        'completed_at',
    ];

    protected $casts = [
        'request_payload' => 'array',
        'response_payload' => 'array',
        'last_attempt_at' => 'datetime',
        'completed_at' => 'datetime',
    ];

    public function service()
    {
        return $this->belongsTo(Service::class);
    }

    /**
     * @return array<int, string>
     */
    public static function activeStatuses(): array
    {
        return [
            self::STATUS_PENDING,
            self::STATUS_QUEUED,
            self::STATUS_BUILDING,
            self::STATUS_PUSHING,
            self::STATUS_DEPLOYING,
            self::STATUS_RETRYING,
            self::STATUS_DELETING,
            self::STATUS_PROVISIONING,
        ];
    }

    /**
     * @return array<int, string>
     */
    public static function successStatuses(): array
    {
        return [
            self::STATUS_READY,
            self::STATUS_SUCCESS,
        ];
    }

    public static function isSuccessStatus(?string $status): bool
    {
        return in_array((string) $status, self::successStatuses(), true);
    }

    public static function isTerminalStatus(?string $status): bool
    {
        return self::isSuccessStatus($status) || (string) $status === self::STATUS_FAILED;
    }
}
