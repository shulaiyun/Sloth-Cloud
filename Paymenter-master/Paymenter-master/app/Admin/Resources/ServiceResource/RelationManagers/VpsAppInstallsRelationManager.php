<?php

namespace App\Admin\Resources\ServiceResource\RelationManagers;

use App\Models\VpsAppInstall;
use App\Services\VpsApps\VpsAppInstallService;
use Filament\Actions\Action;
use Filament\Notifications\Notification;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Schemas\Schema;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class VpsAppInstallsRelationManager extends RelationManager
{
    protected static string $relationship = 'vpsAppInstalls';

    protected static ?string $title = 'VPS App Installs';

    public function form(Schema $schema): Schema
    {
        return $schema->components([]);
    }

    public function table(Table $table): Table
    {
        return $table
            ->modifyQueryUsing(fn ($query) => $query->with(['app.category', 'recipe', 'requestedBy'])->latest('id'))
            ->columns([
                TextColumn::make('app.name')
                    ->label('App')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('app.app_type')
                    ->label('Type')
                    ->badge(),
                TextColumn::make('status')
                    ->badge()
                    ->color(fn (string $state) => match ($state) {
                        VpsAppInstall::STATUS_READY => 'success',
                        VpsAppInstall::STATUS_FAILED => 'danger',
                        VpsAppInstall::STATUS_INSTALLING => 'warning',
                        VpsAppInstall::STATUS_RETRYING => 'gray',
                        default => 'info',
                    }),
                TextColumn::make('install_strategy')
                    ->label('Strategy')
                    ->badge(),
                TextColumn::make('requested_os')
                    ->label('OS')
                    ->toggleable(),
                TextColumn::make('source')
                    ->badge()
                    ->toggleable(),
                TextColumn::make('attempt_count')
                    ->label('Attempts'),
                TextColumn::make('last_error')
                    ->limit(90)
                    ->wrap()
                    ->toggleable(),
                TextColumn::make('installed_at')
                    ->dateTime()
                    ->toggleable(),
                TextColumn::make('updated_at')
                    ->since(),
            ])
            ->headerActions([])
            ->recordActions([
                Action::make('retry')
                    ->icon('ri-refresh-line')
                    ->color('warning')
                    ->visible(fn (VpsAppInstall $record) => in_array($record->status, [
                        VpsAppInstall::STATUS_FAILED,
                        VpsAppInstall::STATUS_RETRYING,
                    ], true))
                    ->requiresConfirmation()
                    ->action(function (VpsAppInstall $record) {
                        app(VpsAppInstallService::class)->retryInstall($this->ownerRecord, $record, auth()->user());

                        Notification::make()
                            ->title('App install retry queued')
                            ->success()
                            ->send();
                    }),
            ]);
    }
}
