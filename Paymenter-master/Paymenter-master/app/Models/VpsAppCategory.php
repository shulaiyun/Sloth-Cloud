<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;

class VpsAppCategory extends Model
{
    use HasFactory;

    protected $guarded = [];

    protected $casts = [
        'search_keywords' => 'array',
        'enabled' => 'bool',
    ];

    public function apps(): HasMany
    {
        return $this->hasMany(VpsApp::class)->orderBy('sort')->orderBy('id');
    }
}
