<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vps_app_installs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('service_id')->constrained()->cascadeOnDelete();
            $table->foreignId('vps_app_id')->constrained('vps_apps')->cascadeOnDelete();
            $table->foreignId('vps_app_recipe_id')->nullable()->constrained('vps_app_recipes')->nullOnDelete();
            $table->foreignId('requested_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('source', 32)->default('checkout');
            $table->string('status', 32)->default('pending');
            $table->boolean('is_primary')->default(false);
            $table->string('install_strategy', 16)->nullable();
            $table->string('requested_os')->nullable();
            $table->unsignedInteger('attempt_count')->default(0);
            $table->text('last_error')->nullable();
            $table->json('logs')->nullable();
            $table->json('request_payload')->nullable();
            $table->json('response_payload')->nullable();
            $table->dateTime('started_at')->nullable();
            $table->dateTime('last_attempt_at')->nullable();
            $table->dateTime('completed_at')->nullable();
            $table->dateTime('installed_at')->nullable();
            $table->timestamps();

            $table->unique(['service_id', 'vps_app_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vps_app_installs');
    }
};
