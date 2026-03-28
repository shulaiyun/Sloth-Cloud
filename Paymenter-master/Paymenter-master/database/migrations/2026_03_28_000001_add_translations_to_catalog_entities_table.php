<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->json('name_translations')->nullable()->after('name');
            $table->json('description_translations')->nullable()->after('description');
        });

        Schema::table('products', function (Blueprint $table) {
            $table->json('name_translations')->nullable()->after('name');
            $table->json('description_translations')->nullable()->after('description');
        });

        Schema::table('plans', function (Blueprint $table) {
            $table->json('name_translations')->nullable()->after('name');
        });

        Schema::table('config_options', function (Blueprint $table) {
            $table->json('name_translations')->nullable()->after('name');
            $table->json('description_translations')->nullable()->after('description');
        });

        foreach (DB::table('categories')->select('id', 'name', 'description')->cursor() as $row) {
            DB::table('categories')
                ->where('id', $row->id)
                ->update([
                    'name_translations' => json_encode([
                        'zh-CN' => $row->name,
                        'zh-TW' => $row->name,
                        'en-US' => $row->name,
                        'default' => $row->name,
                    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'description_translations' => $row->description === null
                        ? null
                        : json_encode([
                            'zh-CN' => $row->description,
                            'zh-TW' => $row->description,
                            'en-US' => $row->description,
                            'default' => $row->description,
                        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ]);
        }

        foreach (DB::table('products')->select('id', 'name', 'description')->cursor() as $row) {
            DB::table('products')
                ->where('id', $row->id)
                ->update([
                    'name_translations' => json_encode([
                        'zh-CN' => $row->name,
                        'zh-TW' => $row->name,
                        'en-US' => $row->name,
                        'default' => $row->name,
                    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'description_translations' => $row->description === null
                        ? null
                        : json_encode([
                            'zh-CN' => $row->description,
                            'zh-TW' => $row->description,
                            'en-US' => $row->description,
                            'default' => $row->description,
                        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ]);
        }

        foreach (DB::table('plans')->select('id', 'name')->cursor() as $row) {
            DB::table('plans')
                ->where('id', $row->id)
                ->update([
                    'name_translations' => $row->name === null
                        ? null
                        : json_encode([
                            'zh-CN' => $row->name,
                            'zh-TW' => $row->name,
                            'en-US' => $row->name,
                            'default' => $row->name,
                        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ]);
        }

        foreach (DB::table('config_options')->select('id', 'name', 'description')->cursor() as $row) {
            DB::table('config_options')
                ->where('id', $row->id)
                ->update([
                    'name_translations' => json_encode([
                        'zh-CN' => $row->name,
                        'zh-TW' => $row->name,
                        'en-US' => $row->name,
                        'default' => $row->name,
                    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'description_translations' => $row->description === null
                        ? null
                        : json_encode([
                            'zh-CN' => $row->description,
                            'zh-TW' => $row->description,
                            'en-US' => $row->description,
                            'default' => $row->description,
                        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                ]);
        }
    }

    public function down(): void
    {
        Schema::table('config_options', function (Blueprint $table) {
            $table->dropColumn(['name_translations', 'description_translations']);
        });

        Schema::table('plans', function (Blueprint $table) {
            $table->dropColumn('name_translations');
        });

        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['name_translations', 'description_translations']);
        });

        Schema::table('categories', function (Blueprint $table) {
            $table->dropColumn(['name_translations', 'description_translations']);
        });
    }
};
