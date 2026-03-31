<?php

namespace App\Admin\Resources;

use App\Admin\Resources\ProvisioningMappingResource\Pages\CreateProvisioningMapping;
use App\Admin\Resources\ProvisioningMappingResource\Pages\EditProvisioningMapping;
use App\Admin\Resources\ProvisioningMappingResource\Pages\ListProvisioningMappings;
use App\Models\ProvisioningMapping;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\KeyValue;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class ProvisioningMappingResource extends Resource
{
    protected static ?string $model = ProvisioningMapping::class;

    protected static string|\BackedEnum|null $navigationIcon = 'ri-route-line';

    protected static string|\BackedEnum|null $activeNavigationIcon = 'ri-route-fill';

    protected static ?int $navigationSort = 11;

    public static function getNavigationGroup(): ?string
    {
        return admin_t('sloth-admin.groups.configuration', 'Configuration');
    }

    public static function getNavigationLabel(): string
    {
        return admin_t('sloth-admin.resources.provisioning_mapping.navigation', 'Provisioning Mappings');
    }

    public static function getModelLabel(): string
    {
        return admin_t('sloth-admin.resources.provisioning_mapping.singular', 'Provisioning Mapping');
    }

    public static function getPluralModelLabel(): string
    {
        return admin_t('sloth-admin.resources.provisioning_mapping.plural', 'Provisioning Mappings');
    }

    public static function form(Schema $schema): Schema
    {
        return $schema->components([
            Select::make('provider')
                ->required()
                ->default('convoy')
                ->options([
                    'convoy' => 'Convoy',
                ]),
            TextInput::make('priority')
                ->numeric()
                ->default(100)
                ->required()
                ->helperText('Smaller values are evaluated first.'),
            Toggle::make('enabled')
                ->default(true)
                ->required(),
            TextInput::make('product_id')
                ->numeric()
                ->nullable()
                ->helperText('Optional exact match by product id.'),
            TextInput::make('product_slug')
                ->maxLength(191)
                ->nullable()
                ->helperText('Optional exact match by product slug.'),
            TextInput::make('plan_id')
                ->numeric()
                ->nullable()
                ->helperText('Optional exact match by plan id.'),
            TextInput::make('plan_name')
                ->maxLength(191)
                ->nullable()
                ->helperText('Optional exact match by plan name slug.'),
            TextInput::make('template_ref')
                ->maxLength(191)
                ->nullable()
                ->helperText('Default OS/template reference to write into service properties.'),
            TextInput::make('node_ref')
                ->maxLength(191)
                ->nullable()
                ->helperText('Default node reference to write into service properties.'),
            KeyValue::make('config')
                ->nullable()
                ->helperText('Optional provider config (e.g. cpu/ram/disk/bandwidth/hostname).'),
        ])->columns(2);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('id')
                    ->label('ID')
                    ->sortable(),
                TextColumn::make('provider')
                    ->badge()
                    ->sortable(),
                TextColumn::make('priority')
                    ->sortable(),
                TextColumn::make('product_id')
                    ->label('Product ID')
                    ->toggleable(),
                TextColumn::make('product_slug')
                    ->label('Product Slug')
                    ->searchable()
                    ->toggleable(),
                TextColumn::make('plan_id')
                    ->label('Plan ID')
                    ->toggleable(),
                TextColumn::make('plan_name')
                    ->label('Plan Name')
                    ->searchable()
                    ->toggleable(),
                TextColumn::make('template_ref')
                    ->label('Template')
                    ->toggleable(),
                TextColumn::make('node_ref')
                    ->label('Node')
                    ->toggleable(),
                IconColumn::make('enabled')
                    ->boolean()
                    ->label('Enabled'),
                TextColumn::make('updated_at')
                    ->dateTime()
                    ->label('Updated')
                    ->sortable(),
            ])
            ->filters([
                //
            ])
            ->recordActions([
                EditAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }

    public static function getRelations(): array
    {
        return [
            //
        ];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListProvisioningMappings::route('/'),
            'create' => CreateProvisioningMapping::route('/create'),
            'edit' => EditProvisioningMapping::route('/{record}/edit'),
        ];
    }
}

