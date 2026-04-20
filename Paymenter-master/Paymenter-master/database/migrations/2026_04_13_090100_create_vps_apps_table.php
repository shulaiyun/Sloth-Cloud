<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vps_apps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vps_app_category_id')->constrained('vps_app_categories')->cascadeOnDelete();
            $table->string('slug')->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('icon')->nullable();
            $table->string('app_type', 16)->default('addon');
            $table->string('tagline')->nullable();
            $table->json('search_keywords')->nullable();
            $table->boolean('featured')->default(false);
            $table->boolean('enabled')->default(true);
            $table->boolean('allow_on_existing_service')->default(true);
            $table->integer('sort')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vps_apps');
    }
};
