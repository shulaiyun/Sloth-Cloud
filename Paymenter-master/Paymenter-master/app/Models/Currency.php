<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Cache;

class Currency extends Model
{
    use HasFactory;

    private const SUPPORTED_FORMATS = ['1.000,00', '1,000.00', '1 000,00', '1 000.00'];

    private const FALLBACK_FORMAT = '1,000.00';

    private static bool $baselineEnsured = false;

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
            'prefix' => 'CNY ',
            'suffix' => '',
            'format' => '1,000.00',
        ],
        [
            'code' => 'EUR',
            'name' => 'Euro',
            'prefix' => 'EUR ',
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
            'prefix' => 'JPY ',
            'suffix' => '',
            'format' => '1,000.00',
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

    private static function normalizeBaselineCurrency(array $currency): array
    {
        $code = strtoupper(trim((string) ($currency['code'] ?? '')));
        $name = trim((string) ($currency['name'] ?? $code));
        $prefix = (string) ($currency['prefix'] ?? '');
        $suffix = (string) ($currency['suffix'] ?? '');
        $format = (string) ($currency['format'] ?? self::FALLBACK_FORMAT);

        if (!in_array($format, self::SUPPORTED_FORMATS, true)) {
            $format = self::FALLBACK_FORMAT;
        }

        return [
            'code' => $code,
            'name' => $name !== '' ? $name : $code,
            'prefix' => $prefix,
            'suffix' => $suffix,
            'format' => $format,
        ];
    }

    public static function ensureBaseline(): void
    {
        if (self::$baselineEnsured) {
            return;
        }

        $changed = false;

        foreach (static::BASELINE as $currency) {
            $payload = static::normalizeBaselineCurrency($currency);
            if ($payload['code'] === '') {
                continue;
            }

            $existing = static::query()->whereKey($payload['code'])->first();

            if (!$existing) {
                try {
                    static::query()->create($payload);
                } catch (QueryException $exception) {
                    $message = strtolower($exception->getMessage());
                    if (!str_contains($message, 'format')) {
                        throw $exception;
                    }

                    // Guard against legacy / malformed format strings in old deployments.
                    $payload['format'] = self::FALLBACK_FORMAT;
                    static::query()->create($payload);
                }

                $changed = true;
                continue;
            }

            $updates = [];

            if (!is_string($existing->name) || trim($existing->name) === '') {
                $updates['name'] = $payload['name'];
            }

            if (!in_array((string) $existing->format, self::SUPPORTED_FORMATS, true)) {
                $updates['format'] = self::FALLBACK_FORMAT;
            }

            if ($updates !== []) {
                $existing->fill($updates);
                $existing->save();
                $changed = true;
            }
        }

        if ($changed) {
            Cache::flush();
        }

        self::$baselineEnsured = true;
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
