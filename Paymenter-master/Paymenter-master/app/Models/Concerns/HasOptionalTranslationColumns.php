<?php

namespace App\Models\Concerns;

use Illuminate\Support\Facades\Schema;

trait HasOptionalTranslationColumns
{
    protected static array $optionalTranslationColumnCache = [];

    public function setAttribute($key, $value)
    {
        if (in_array($key, $this->optionalTranslationColumns(), true) && !$this->hasOptionalTranslationColumn($key)) {
            return $this;
        }

        return parent::setAttribute($key, $value);
    }

    protected static function bootHasOptionalTranslationColumns(): void
    {
        static::saving(function ($model): void {
            $model->removeMissingTranslationAttributes();
        });
    }

    protected function removeMissingTranslationAttributes(): void
    {
        foreach ($this->optionalTranslationColumns() as $column) {
            if ($this->hasOptionalTranslationColumn($column)) {
                continue;
            }

            if (array_key_exists($column, $this->attributes)) {
                unset($this->attributes[$column]);
            }
        }
    }

    protected function hasOptionalTranslationColumn(string $column): bool
    {
        $cacheKey = $this->getTable() . '.' . $column;

        if (!array_key_exists($cacheKey, self::$optionalTranslationColumnCache)) {
            try {
                self::$optionalTranslationColumnCache[$cacheKey] = Schema::hasColumn($this->getTable(), $column);
            } catch (\Throwable) {
                self::$optionalTranslationColumnCache[$cacheKey] = false;
            }
        }

        return self::$optionalTranslationColumnCache[$cacheKey];
    }

    protected function optionalTranslationColumns(): array
    {
        return [];
    }
}

