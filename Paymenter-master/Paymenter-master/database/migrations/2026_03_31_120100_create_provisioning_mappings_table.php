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
        Schema::create('provisioning_mappings', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 64)->default('convoy')->index();
            $table->unsignedBigInteger('product_id')->nullable()->index();
            $table->string('product_slug', 191)->nullable()->index();
            $table->unsignedBigInteger('plan_id')->nullable()->index();
            $table->string('plan_name', 191)->nullable()->index();
            $table->string('template_ref', 191)->nullable();
            $table->string('node_ref', 191)->nullable();
            $table->json('config')->nullable();
            $table->unsignedInteger('priority')->default(100)->index();
            $table->boolean('enabled')->default(true)->index();
            $table->timestamps();

            $table->index(
                ['provider', 'enabled', 'product_id', 'product_slug', 'plan_id', 'plan_name'],
                'provisioning_mappings_lookup_idx'
            );
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('provisioning_mappings');
    }
};
