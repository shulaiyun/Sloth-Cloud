<?php

namespace App\Admin\Resources;

use App\Admin\Clusters\Services;
use App\Admin\Resources\VpsAppCategoryResource\Pages\CreateVpsAppCategory;
use App\Admin\Resources\VpsAppCategoryResource\Pages\EditVpsAppCategory;
use App\Admin\Resources\VpsAppCategoryResource\Pages\ListVpsAppCategories;
use App\Models\VpsAppCategory;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\TagsInput;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class VpsAppCategoryResource extends Resource
{
    protected static ?string $model = VpsAppCategory::class;

    protected static string|\BackedEnum|null $navigationIcon = 'ri-apps-2-line';

    protected static string|\BackedEnum|null $activeNavigationIcon = 'ri-apps-2-fill';

    protected static ?int $navigationSort = 30;

    protected static ?string $cluster = Services::class;

    public static function getNavigationLabel(): string
    {
        return 'VPS App Categories';
    }

    public static function getModelLabel(): string
    {
        return 'VPS App Category';
    }

    public static function getPluralModelLabel(): string
    {
        return 'VPS App Categories';
    }

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('name')
                    ->required()
                    ->maxLength(255),
                TextInput::make('slug')
                    ->required()
                    ->maxLength(255)
                    ->unique(ignoreRecord: true),
                TextInput::make('icon')
                    ->maxLength(255),
                TextInput::make('sort')
                    ->numeric()
                    ->default(0)
                    ->required(),
                Toggle::make('enabled')
                    ->default(true)
                    ->required(),
                TagsInput::make('search_keywords')
                    ->placeholder('docker, 面板, 控制台')
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
            ->modifyQueryUsing(fn ($query) => $query->withCount('apps'))
            ->columns([
                TextColumn::make('name')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('slug')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('apps_count')
                    ->label('Apps')
                    ->sortable(),
                TextColumn::make('icon')
                    ->toggleable(),
                IconColumn::make('enabled')
                    ->boolean(),
                TextColumn::make('sort')
                    ->sortable(),
                TextColumn::make('updated_at')
                    ->since()
                    ->toggleable(),
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
            'index' => ListVpsAppCategories::route('/'),
            'create' => CreateVpsAppCategory::route('/create'),
            'edit' => EditVpsAppCategory::route('/{record}/edit'),
        ];
    }
}
