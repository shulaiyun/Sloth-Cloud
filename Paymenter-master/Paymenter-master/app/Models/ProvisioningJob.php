<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;

class ProvisioningJob extends Model
{
    use HasFactory;

    public const STATUS_PENDING = 'pending';

    public const STATUS_PROVISIONING = 'provisioning';

    public const STATUS_SUCCESS = 'success';

    public const STATUS_FAILED = 'failed';

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
}
