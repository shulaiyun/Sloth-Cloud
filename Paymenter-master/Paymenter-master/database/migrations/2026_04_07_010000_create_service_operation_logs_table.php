<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('service_operation_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('service_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('operation_id', 64)->unique();
            $table->string('action', 120)->index();
            $table->string('source', 64)->default('headless-bff')->index();
            $table->string('status', 32)->default('success')->index();
            $table->string('message', 255)->nullable();
            $table->string('error_code', 120)->nullable()->index();
            $table->text('error_detail')->nullable();
            $table->json('request_payload')->nullable();
            $table->json('response_payload')->nullable();
            $table->string('actor_type', 32)->default('user');
            $table->unsignedBigInteger('actor_id')->nullable();
            $table->timestamps();

            $table->index(['service_id', 'created_at'], 'service_operation_logs_service_created_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('service_operation_logs');
    }
};
