<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Support\Facades\Cache;

class Currency extends Model
{
    use HasFactory;

    public const BASELINE = [
        [
            'code' => 'USD',
            'name' => 'US Dollar',
            'prefix' => '$',
            'suffix' => '',
            'format' => '1,000.00',
        ],
        [
            'code' => 'CNY',
            'name' => 'Chinese Yuan',
            'prefix' => '¥',
            'suffix' => '',
            'format' => '1,000.00',
        ],
        [
            'code' => 'EUR',
            'name' => 'Euro',
            'prefix' => '€',
            'suffix' => '',
            'format' => '1,000.00',
        ],
        [
            'code' => 'HKD',
            'name' => 'Hong Kong Dollar',
            'prefix' => 'HK$',
            'suffix' => '',
            'format' => '1,000.00',
        ],
        [
            'code' => 'JPY',
            'name' => 'Japanese Yen',
            'prefix' => '¥',
            'suffix' => '',
            'format' => '1,000',
        ],
        [
            'code' => 'SGD',
            'name' => 'Singapore Dollar',
            'prefix' => 'S$',
            'suffix' => '',
            'format' => '1,000.00',
        ],
    ];

    public $timestamps = false;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $primaryKey = 'code';

    protected $fillable = [
        'code',
        'name',
        'prefix',
        'suffix',
        'format',
    ];

    public static function ensureBaseline(): void
    {
        static::query()->upsert(static::BASELINE, ['code'], ['name', 'prefix', 'suffix', 'format']);
        Cache::flush();
    }

    public static function codeOptions(array $excluded = []): array
    {
        static::ensureBaseline();

        $excluded = array_values(array_filter($excluded, fn ($code) => is_string($code) && $code !== ''));

        return static::query()
            ->when($excluded !== [], fn ($query) => $query->whereNotIn('code', $excluded))
            ->orderBy('code')
            ->pluck('code', 'code')
            ->toArray();
    }

    public static function defaultCode(): ?string
    {
        static::ensureBaseline();

        $configured = config('settings.default_currency');

        if (is_string($configured) && $configured !== '' && static::query()->whereKey($configured)->exists()) {
            return $configured;
        }

        return static::query()->orderBy('code')->value('code');
    }

    public function newEloquentBuilder($query)
    {
        return new Builders\CacheableBuilder($query);
    }

    protected static function booted()
    {
        static::created(function () {
            Cache::flush();
        });

        static::saved(function () {
            Cache::flush();
        });

        static::deleted(function () {
            Cache::flush();
        });
    }

    public function services()
    {
        return $this->hasMany(Service::class, 'currency_code', 'code');
    }

    public function orders()
    {
        return $this->hasMany(Order::class, 'currency_code', 'code');
    }

    public function credits()
    {
        return $this->hasMany(Credit::class, 'currency_code', 'code');
    }

    public function carts()
    {
        return $this->hasMany(Cart::class, 'currency_code', 'code');
    }
}
