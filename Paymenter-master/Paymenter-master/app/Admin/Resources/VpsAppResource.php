<?php

namespace App\Admin\Resources;

use App\Admin\Clusters\Services;
use App\Admin\Resources\VpsAppResource\Pages\CreateVpsApp;
use App\Admin\Resources\VpsAppResource\Pages\EditVpsApp;
use App\Admin\Resources\VpsAppResource\Pages\ListVpsApps;
use App\Models\VpsApp;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TagsInput;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class VpsAppResource extends Resource
{
    protected static ?string $model = VpsApp::class;

    protected static string|\BackedEnum|null $navigationIcon = 'ri-layout-grid-line';

    protected static string|\BackedEnum|null $activeNavigationIcon = 'ri-layout-grid-fill';

    protected static ?int $navigationSort = 31;

    protected static ?string $cluster = Services::class;

    public static function getNavigationLabel(): string
    {
        return 'VPS Apps';
    }

    public static function getModelLabel(): string
    {
        return 'VPS App';
    }

    public static function getPluralModelLabel(): string
    {
        return 'VPS Apps';
    }

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('vps_app_category_id')
                    ->label('Category')
                    ->relationship('category', 'name')
                    ->searchable()
                    ->preload()
                    ->required(),
                Select::make('app_type')
                    ->label('App Type')
                    ->options([
                        VpsApp::TYPE_MAIN => 'Primary App',
                        VpsApp::TYPE_ADDON => 'Addon',
                    ])
                    ->default(VpsApp::TYPE_ADDON)
                    ->required(),
                TextInput::make('name')
                    ->required()
                    ->maxLength(255),
                TextInput::make('slug')
                    ->required()
                    ->maxLength(255)
                    ->unique(ignoreRecord: true),
                TextInput::make('tagline')
                    ->maxLength(255),
                TextInput::make('icon')
                    ->maxLength(255),
                TextInput::make('sort')
                    ->numeric()
                    ->default(0)
                    ->required(),
                Toggle::make('featured')
                    ->default(false)
                    ->required(),
                Toggle::make('enabled')
                    ->default(true)
                    ->required(),
                Toggle::make('allow_on_existing_service')
                    ->default(true)
                    ->required(),
                TagsInput::make('search_keywords')
                    ->placeholder('docker, panel, mysql')
                    ->columnSpanFull(),
                Textarea::make('description')
                    ->rows(4)
                    ->columnSpanFull(),
            ])
            ->columns(2);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->modifyQueryUsing(fn ($query) => $query->with(['category'])->withCount('recipes'))
            ->columns([
                TextColumn::make('name')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('slug')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('category.name')
                    ->label('Category')
                    ->sortable(),
                TextColumn::make('app_type')
                    ->label('Type')
                    ->badge()
                    ->color(fn (string $state) => $state === VpsApp::TYPE_MAIN ? 'primary' : 'gray'),
                TextColumn::make('recipes_count')
                    ->label('Recipes')
                    ->sortable(),
                IconColumn::make('featured')
                    ->boolean(),
                IconColumn::make('enabled')
                    ->boolean(),
                TextColumn::make('sort')
                    ->sortable(),
            ])
            ->recordActions([
                EditAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ])
            ->defaultSort('sort');
    }

    public static function getPages(): array
    {
        return [
            'index' => ListVpsApps::route('/'),
            'create' => CreateVpsApp::route('/create'),
            'edit' => EditVpsApp::route('/{record}/edit'),
        ];
    }
}
