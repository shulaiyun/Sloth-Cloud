<?php

namespace App\Admin\Resources;

use App\Admin\Clusters\Services;
use App\Admin\Resources\VpsAppRecipeResource\Pages\CreateVpsAppRecipe;
use App\Admin\Resources\VpsAppRecipeResource\Pages\EditVpsAppRecipe;
use App\Admin\Resources\VpsAppRecipeResource\Pages\ListVpsAppRecipes;
use App\Models\VpsAppRecipe;
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

class VpsAppRecipeResource extends Resource
{
    protected static ?string $model = VpsAppRecipe::class;

    protected static string|\BackedEnum|null $navigationIcon = 'ri-terminal-box-line';

    protected static string|\BackedEnum|null $activeNavigationIcon = 'ri-terminal-box-fill';

    protected static ?int $navigationSort = 32;

    protected static ?string $cluster = Services::class;

    public static function getNavigationLabel(): string
    {
        return 'VPS App Recipes';
    }

    public static function getModelLabel(): string
    {
        return 'VPS App Recipe';
    }

    public static function getPluralModelLabel(): string
    {
        return 'VPS App Recipes';
    }

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('vps_app_id')
                    ->label('App')
                    ->relationship('app', 'name')
                    ->searchable()
                    ->preload()
                    ->required(),
                Select::make('os_version')
                    ->label('Operating System')
                    ->options(array_combine(
                        config('vps_apps.supported_os', []),
                        config('vps_apps.supported_os', []),
                    ) ?: [])
                    ->required(),
                Select::make('install_strategy')
                    ->options([
                        VpsAppRecipe::STRATEGY_TEMPLATE => 'Template only',
                        VpsAppRecipe::STRATEGY_SCRIPT => 'Script only',
                        VpsAppRecipe::STRATEGY_HYBRID => 'Hybrid (template first, fallback to script)',
                    ])
                    ->required()
                    ->default(VpsAppRecipe::STRATEGY_SCRIPT),
                TextInput::make('template_ref')
                    ->maxLength(255),
                TextInput::make('default_login_username')
                    ->maxLength(255),
                TextInput::make('panel_port')
                    ->numeric()
                    ->nullable(),
                Select::make('panel_scheme')
                    ->options([
                        'http' => 'http',
                        'https' => 'https',
                    ])
                    ->nullable(),
                TextInput::make('panel_path')
                    ->maxLength(255),
                TextInput::make('panel_label')
                    ->maxLength(255),
                TextInput::make('script_timeout_seconds')
                    ->numeric()
                    ->default(900)
                    ->required(),
                TextInput::make('sort')
                    ->numeric()
                    ->default(0)
                    ->required(),
                Toggle::make('allow_on_existing_service')
                    ->default(true)
                    ->required(),
                Toggle::make('enabled')
                    ->default(true)
                    ->required(),
                TagsInput::make('dependencies')
                    ->placeholder('docker-ce, docker-compose')
                    ->columnSpanFull(),
                TagsInput::make('conflicts')
                    ->placeholder('nginx, caddy')
                    ->columnSpanFull(),
                Textarea::make('notes')
                    ->rows(3)
                    ->columnSpanFull(),
                Textarea::make('script_body')
                    ->rows(18)
                    ->columnSpanFull(),
            ])
            ->columns(2);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->modifyQueryUsing(fn ($query) => $query->with('app'))
            ->columns([
                TextColumn::make('app.name')
                    ->label('App')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('os_version')
                    ->label('OS')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('install_strategy')
                    ->badge()
                    ->sortable(),
                TextColumn::make('template_ref')
                    ->limit(32)
                    ->toggleable(),
                TextColumn::make('panel_port')
                    ->label('Port')
                    ->toggleable(),
                IconColumn::make('allow_on_existing_service')
                    ->boolean()
                    ->label('Existing'),
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
            'index' => ListVpsAppRecipes::route('/'),
            'create' => CreateVpsAppRecipe::route('/create'),
            'edit' => EditVpsAppRecipe::route('/{record}/edit'),
        ];
    }
}
