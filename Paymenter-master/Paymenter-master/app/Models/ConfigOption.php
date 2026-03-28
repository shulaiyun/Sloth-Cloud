<?php

namespace App\Models;

use App\Models\Concerns\HasOptionalTranslationColumns;
use App\Models\Traits\HasPlans;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use OwenIt\Auditing\Contracts\Auditable;

class ConfigOption extends Model implements Auditable
{
    use HasFactory;
    use HasOptionalTranslationColumns;
    use HasPlans;
    use Traits\Auditable;

    protected $dontShowUnavailablePrice = true;

    protected $fillable = [
        'name',
        'description',
        'name_translations',
        'description_translations',
        'env_variable',
        'type',
        'sort',
        'hidden',
        'parent_id',
        'upgradable',
    ];

    protected $casts = [
        'name_translations' => 'array',
        'description_translations' => 'array',
    ];

    /**
     * Get the parent option.
     */
    public function parent()
    {
        return $this->belongsTo(ConfigOption::class, 'parent_id');
    }

    /**
     * Get the options that belong to the parent. (children or options)
     */
    public function children()
    {
        return $this->hasMany(ConfigOption::class, 'parent_id')->orderBy('sort');
    }

    /**
     * Get the products that belong to the option.
     */
    public function products()
    {
        return $this->belongsToMany(Product::class, 'config_option_products');
    }

    /**
     * Get the service configs that belong to the option.
     */
    public function serviceConfigs()
    {
        return $this->hasMany(ServiceConfig::class, 'config_option_id');
    }

    protected function optionalTranslationColumns(): array
    {
        return ['name_translations', 'description_translations'];
    }
}
