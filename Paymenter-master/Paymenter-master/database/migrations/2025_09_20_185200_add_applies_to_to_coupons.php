<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasTable('coupons')) {
            return;
        }

        if (!Schema::hasColumn('coupons', 'applies_to')) {
            Schema::table('coupons', function (Blueprint $table) {
                // Applies to, either setup fee, price, or both.
                $table->string('applies_to')->default('all')->after('type');
            });
        }

        DB::table('coupons')
            ->where('type', 'free_setup')
            ->update([
                'applies_to' => 'setup_fee',
                'type' => 'percentage',
                'value' => 100,
            ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasTable('coupons') || !Schema::hasColumn('coupons', 'applies_to')) {
            return;
        }

        Schema::table('coupons', function (Blueprint $table) {
            $table->dropColumn('applies_to');
        });
    }
};
