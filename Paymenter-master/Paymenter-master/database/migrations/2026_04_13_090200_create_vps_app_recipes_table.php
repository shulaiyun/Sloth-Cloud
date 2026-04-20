<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vps_app_recipes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vps_app_id')->constrained('vps_apps')->cascadeOnDelete();
            $table->string('os_version');
            $table->string('install_strategy', 16)->default('script');
            $table->string('template_ref')->nullable();
            $table->longText('script_body')->nullable();
            $table->json('dependencies')->nullable();
            $table->json('conflicts')->nullable();
            $table->string('default_login_username')->nullable();
            $table->unsignedInteger('panel_port')->nullable();
            $table->string('panel_path')->nullable();
            $table->string('panel_scheme', 16)->nullable();
            $table->string('panel_label')->nullable();
            $table->unsignedInteger('script_timeout_seconds')->default(900);
            $table->boolean('allow_on_existing_service')->default(true);
            $table->boolean('enabled')->default(true);
            $table->integer('sort')->default(0);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['vps_app_id', 'os_version']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vps_app_recipes');
    }
};
