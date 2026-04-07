<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Casts\Attribute;

class ServiceOperationLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'service_id',
        'user_id',
        'operation_id',
        'action',
        'source',
        'status',
        'message',
        'error_code',
        'error_detail',
        'request_payload',
        'response_payload',
        'actor_type',
        'actor_id',
    ];

    protected $casts = [
        'request_payload' => 'array',
        'response_payload' => 'array',
    ];

    public function service()
    {
        return $this->belongsTo(Service::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    protected function success(): Attribute
    {
        return Attribute::make(
            get: function (): ?bool {
                if ($this->status === 'success') {
                    return true;
                }

                if ($this->status === 'failed') {
                    return false;
                }

                return null;
            }
        );
    }

    protected function code(): Attribute
    {
        return Attribute::make(
            get: fn (): ?string => $this->error_code
        );
    }

    protected function detail(): Attribute
    {
        return Attribute::make(
            get: fn (): ?string => $this->error_detail
        );
    }
}
