<?php

namespace App\Admin\Resources\ServiceResource\RelationManagers;

use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class ServiceOperationLogsRelationManager extends RelationManager
{
    protected static string $relationship = 'serviceOperationLogs';

    public function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('operation_id')
            ->columns([
                TextColumn::make('created_at')
                    ->label('Created')
                    ->since()
                    ->sortable(),
                TextColumn::make('action')
                    ->label('Action')
                    ->searchable(),
                TextColumn::make('status')
                    ->label('Status')
                    ->badge()
                    ->color(fn (string $state): string => match ($state) {
                        'success' => 'success',
                        'submitted' => 'warning',
                        'failed' => 'danger',
                        default => 'gray',
                    }),
                TextColumn::make('source')
                    ->label('Source')
                    ->toggleable(),
                TextColumn::make('message')
                    ->label('Message')
                    ->limit(60)
                    ->wrap(),
                TextColumn::make('error_code')
                    ->label('Error Code')
                    ->toggleable(),
                TextColumn::make('operation_id')
                    ->label('Operation ID')
                    ->copyable()
                    ->toggleable(),
            ])
            ->defaultSort('created_at', 'desc');
    }
}
