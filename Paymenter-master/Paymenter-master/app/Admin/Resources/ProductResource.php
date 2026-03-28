<?php

namespace App\Admin\Resources;

use App\Admin\Resources\ProductResource\Pages\CreateProduct;
use App\Admin\Resources\ProductResource\Pages\EditProduct;
use App\Admin\Resources\ProductResource\Pages\ListProducts;
use App\Classes\FilamentInput;
use App\Helpers\ExtensionHelper;
use App\Models\Currency;
use App\Models\Product;
use App\Models\Server;
use Exception;
use Filament\Actions\Action;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Checkbox;
use Filament\Forms\Components\FileUpload;
use Filament\Forms\Components\Repeater;
use Filament\Forms\Components\RichEditor;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Infolists\Components\TextEntry;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Grid;
use Filament\Schemas\Components\Tabs;
use Filament\Schemas\Components\Tabs\Tab;
use Filament\Schemas\Components\Utilities\Get;
use Filament\Schemas\Components\Utilities\Set;
use Filament\Schemas\Schema;
use Filament\Support\RawJs;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema as DatabaseSchema;
use Illuminate\Support\Str;
use Livewire\Component;

class ProductResource extends Resource
{
    protected static ?bool $catalogTranslationColumnsAvailable = null;

    protected static ?bool $planTranslationColumnAvailable = null;

    protected static ?string $model = Product::class;

    protected static string|\BackedEnum|null $navigationIcon = 'ri-instance-line';

    protected static string|\BackedEnum|null $activeNavigationIcon = 'ri-instance-fill';

    protected static ?string $recordTitleAttribute = 'name';

    public static function getNavigationGroup(): ?string
    {
        return admin_t('sloth-admin.groups.administration', 'Administration');
    }

    public static function getNavigationLabel(): string
    {
        return admin_t('sloth-admin.resources.product.navigation', 'Products');
    }

    public static function getModelLabel(): string
    {
        return admin_t('sloth-admin.resources.product.singular', 'Product');
    }

    public static function getPluralModelLabel(): string
    {
        return admin_t('sloth-admin.resources.product.plural', 'Products');
    }

    public static function form(Schema $schema): Schema
    {
        Currency::ensureBaseline();

        return $schema
            ->components([
                Tabs::make('Tabs')
                    ->persistTabInQueryString()
                    ->tabs([
                        Tab::make(admin_t('sloth-admin.product.tabs.general', 'General'))
                            ->columns(2)
                            ->schema([
                                TextInput::make('name')
                                    ->label(admin_t('sloth-admin.product.fields.name', 'Name'))
                                    ->required()
                                    ->maxLength(255)
                                    ->live(onBlur: true)
                                    ->afterStateUpdated(function (Get $get, Set $set, ?string $old, ?string $state) {
                                        if (($get('slug') ?? '') !== Str::slug($old)) {
                                            return;
                                        }

                                        $set('slug', Str::slug($state));
                                    }),
                                TextInput::make('slug')->label(admin_t('sloth-admin.product.fields.slug', 'Slug'))->required()->unique(ignoreRecord: true),
                                TextInput::make('stock')->label(admin_t('sloth-admin.product.fields.stock', 'Stock'))->integer()->nullable(),
                                TextInput::make('per_user_limit')->label(admin_t('sloth-admin.product.fields.per_user_limit', 'Per-user limit'))->integer()->nullable(),
                                Select::make('allow_quantity')->label(admin_t('sloth-admin.product.fields.allow_quantity', 'Quantity Mode'))->options([
                                    'disabled' => admin_t('sloth-admin.product.options.disabled', 'No'),
                                    'separated' => admin_t('sloth-admin.product.options.separated', 'Separated'),
                                    'combined' => admin_t('sloth-admin.product.options.combined', 'Combined'),
                                ])->default('separated')
                                    ->required(),
                                Textarea::make('email_template')
                                    ->label(admin_t('sloth-admin.product.fields.email_template', 'Email Template Snippet'))
                                    ->hint(admin_t('sloth-admin.product.hints.email_template', 'This snippet will be used in the email template.'))
                                    ->nullable(),
                                Checkbox::make('hidden')
                                    ->label(admin_t('sloth-admin.product.fields.hidden', 'Hide product'))
                                    ->hint(admin_t('sloth-admin.product.hints.hidden', 'Hide the product from the client area.')),

                                RichEditor::make('description')->nullable()->columnSpanFull(),
                                ...self::productTranslationFields(),
                                FileUpload::make('image')
                                    ->label(admin_t('sloth-admin.product.fields.image', 'Image'))
                                    ->nullable()
                                    ->visibility('public')
                                    ->imageEditor()
                                    ->image()
                                    ->disk('public')
                                    ->acceptedFileTypes(['image/*']),
                                Select::make('category_id')
                                    ->label(admin_t('sloth-admin.product.fields.category', 'Category'))
                                    ->relationship('category', 'name')
                                    ->searchable()
                                    ->preload()
                                    ->createOptionForm(fn (Schema $schema) => CategoryResource::form($schema))
                                    ->required(),
                            ]),
                        Tab::make(admin_t('sloth-admin.product.tabs.pricing', 'Pricing'))
                            ->schema([self::plan()]),

                        Tab::make(admin_t('sloth-admin.product.tabs.upgrades', 'Upgrades'))
                            ->schema([
                                // Select input for the products this product can upgrade to (hasmany relationship)
                                Select::make('upgrades')
                                    ->label(admin_t('sloth-admin.product.fields.upgrades', 'Upgrades'))
                                    ->relationship('upgrades', 'name', ignoreRecord: true)
                                    ->multiple()
                                    ->preload()
                                    ->placeholder(admin_t('sloth-admin.product.hints.upgrades', 'Select which products this product can upgrade to.')),
                            ]),

                        Tab::make(admin_t('sloth-admin.product.tabs.server', 'Server'))
                            ->schema([
                                Select::make('server_id')
                                    ->label(admin_t('sloth-admin.product.fields.server', 'Server'))
                                    ->relationship('server', 'name')
                                    ->searchable()
                                    ->preload()
                                    ->hintAction(
                                        Action::make('refresh')
                                            ->label(admin_t('sloth-admin.actions.refresh', 'Refresh'))
                                            ->action(fn () => Cache::set('product_config', null, 0))
                                            ->hidden(fn (Get $get) => $get('server_id') === null)
                                    )
                                    ->live()
                                    ->afterStateUpdated(fn (Select $component) => $component
                                        ->getContainer()
                                        ->getComponent('extension_settings', withHidden: true)
                                        ->getChildSchema()
                                        ->fill()),

                                Grid::make()
                                    ->hidden(fn (Get $get) => $get('server_id') === null)
                                    ->columns(2)
                                    ->key('extension_settings')
                                    ->schema(
                                        function (Get $get, Component $livewire) {
                                            $server = $get('server_id');
                                            if ($server == null) {
                                                return [];
                                            }
                                            $settings = [];

                                            try {
                                                foreach (ExtensionHelper::getProductConfigOnce(Server::findOrFail($server), $get('settings')) as $setting) {
                                                    // Easier to use dot notation for settings
                                                    $setting['name'] = 'settings.' . $setting['name'];
                                                    $settings[] = FilamentInput::convert($setting);
                                                }
                                            } catch (Exception $e) {
                                                $settings[] = TextEntry::make('error')->state($e->getMessage());
                                            }

                                            return $settings;
                                        }
                                    ),

                            ]),
                    ]),
            ])->columns(1);
    }

    public static function plan()
    {
        return Repeater::make('plan')
            ->addActionLabel(admin_t('sloth-admin.actions.add_plan', 'Add new plan'))
            ->relationship('plans')
            ->name('name')
            ->reorderable()
            ->cloneable()
            ->collapsible()
            ->collapsed()
            ->orderColumn()
            ->defaultItems(1)
            ->minItems(1)
            ->columns(2)
            ->deleteAction(function (Action $action) {
                $action->before(function (?Product $record, $state, Action $action, array $arguments) {
                    if (!$record) {
                        return;
                    }
                    $key = $arguments['item'];
                    if (!isset($state[$key]['id'])) {
                        return;
                    }
                    $plan = $record->plans()->find($state[$key]['id']);
                    if ($plan->services()->count() > 0) {
                        Notification::make()
                            ->title('Whoops!')
                            ->body('You cannot delete this plan because it is being used by one or more services.')
                            ->danger()
                            ->send();
                        $action->cancel();
                    }
                });
            })
            ->itemLabel(fn (array $state) => $state['name'])
            ->schema([
                TextInput::make('name')
                    ->label(admin_t('sloth-admin.product.fields.name', 'Name'))
                    ->required()
                    ->live(onBlur: true)
                    ->maxLength(255),
                ...self::planTranslationFields(),
                Select::make('type')
                    ->label(admin_t('sloth-admin.product.fields.type', 'Type'))
                    ->options([
                        'free' => admin_t('sloth-admin.product.options.free', 'Free'),
                        'one-time' => admin_t('sloth-admin.product.options.one_time', 'One Time'),
                        'recurring' => admin_t('sloth-admin.product.options.recurring', 'Recurring'),
                    ])
                    ->required()
                    ->live(debounce: 300)
                    ->afterStateUpdated(function (Get $get, Set $set, ?string $old, ?string $state) {
                        if ($state === 'free') {
                            $set('every', null);
                            $set('price', 0);
                        }
                    })
                    ->placeholder(admin_t('sloth-admin.product.hints.price_type', 'Select the type of billing for this plan.'))
                    ->default('free'),

                TextInput::make('billing_period')
                    ->required()
                    ->label(admin_t('sloth-admin.product.fields.time_interval', 'Time Interval'))
                    ->default(1)
                    ->hidden(fn (Get $get) => $get('type') !== 'recurring'),

                Select::make('billing_unit')
                    ->options([
                        'day' => admin_t('sloth-admin.product.options.day', 'Day'),
                        'week' => admin_t('sloth-admin.product.options.week', 'Week'),
                        'month' => admin_t('sloth-admin.product.options.month', 'Month'),
                        'year' => admin_t('sloth-admin.product.options.year', 'Year'),
                    ])
                    ->label(admin_t('sloth-admin.product.fields.billing_period', 'Billing period'))
                    ->required()
                    ->default('month')
                    ->hidden(fn (Get $get) => $get('type') !== 'recurring'),
                Repeater::make('pricing')
                    ->hidden(fn (Get $get) => $get('type') === 'free')
                    ->columns(3)
                    ->addActionLabel(admin_t('sloth-admin.actions.add_price', 'Add new price'))
                    ->reorderable(false)
                    ->relationship('prices')
                    ->columnSpanFull()
                    ->maxItems(fn () => max(1, count(Currency::codeOptions())))
                    ->defaultItems(1)
                    ->itemLabel(fn (array $state) => $state['currency_code'])
                    ->schema([
                        Select::make('currency_code')
                            ->label(admin_t('sloth-admin.product.fields.currency_code', 'Currency code'))
                            ->options(function (Get $get, ?string $state) {
                                $pricing = collect($get('../../pricing'))->pluck('currency_code');
                                if ($state !== null) {
                                    $pricing = $pricing->filter(function ($code) use ($state) {
                                        return $code !== $state;
                                    });
                                }
                                $pricing = $pricing->filter(function ($code) {
                                    return $code !== null;
                                });

                                return Currency::codeOptions($pricing->toArray());
                            })
                            ->live()
                            ->helperText(fn () => Currency::codeOptions() === [] ? admin_t('sloth-admin.product.hints.no_currencies', 'No currencies are available yet. Baseline currencies will be seeded automatically.') : null)
                            ->default(fn () => Currency::defaultCode())
                            ->required(),
                        TextInput::make('price')
                            ->required()
                            ->label(admin_t('sloth-admin.product.fields.price', 'Price'))
                            // Suffix based on chosen currency
                            ->prefix(fn (Get $get) => Currency::where('code', $get('currency_code'))->first()?->prefix)
                            ->suffix(fn (Get $get) => Currency::where('code', $get('currency_code'))->first()?->suffix)
                            ->live(onBlur: true)
                            ->mask(RawJs::make(
                                <<<'JS'
                                    $money($input, '.', '', 2)
                                JS
                            ))
                            ->numeric()
                            ->minValue(0)
                            ->hidden(fn (Get $get) => $get('type') === 'free'),
                        TextInput::make('setup_fee')
                            ->label(admin_t('sloth-admin.product.fields.setup_fee', 'Setup fee'))
                            ->live(onBlur: true)
                            ->mask(RawJs::make(
                                <<<'JS'
                                    $money($input, '.', '', 2)
                                JS
                            ))
                            ->numeric()
                            ->minValue(0)
                            ->hidden(fn (Get $get) => $get('type') === 'free'),
                    ]),
            ]);
    }

    private static function hasCatalogTranslations(): bool
    {
        if (self::$catalogTranslationColumnsAvailable === null) {
            self::$catalogTranslationColumnsAvailable = DatabaseSchema::hasColumn('products', 'name_translations')
                && DatabaseSchema::hasColumn('products', 'description_translations');
        }

        return self::$catalogTranslationColumnsAvailable;
    }

    private static function hasPlanTranslations(): bool
    {
        if (self::$planTranslationColumnAvailable === null) {
            self::$planTranslationColumnAvailable = DatabaseSchema::hasColumn('plans', 'name_translations');
        }

        return self::$planTranslationColumnAvailable;
    }

    private static function productTranslationFields(): array
    {
        if (!self::hasCatalogTranslations()) {
            return [];
        }

        return [
            Grid::make()
                ->columns(3)
                ->schema([
                    TextInput::make('name_translations.zh-CN')
                        ->label('Name (zh-CN)')
                        ->maxLength(255),
                    TextInput::make('name_translations.zh-TW')
                        ->label('Name (zh-TW)')
                        ->maxLength(255),
                    TextInput::make('name_translations.en-US')
                        ->label('Name (en-US)')
                        ->maxLength(255),
                ]),
            Grid::make()
                ->columns(3)
                ->schema([
                    Textarea::make('description_translations.zh-CN')
                        ->label('Description (zh-CN)')
                        ->rows(4),
                    Textarea::make('description_translations.zh-TW')
                        ->label('Description (zh-TW)')
                        ->rows(4),
                    Textarea::make('description_translations.en-US')
                        ->label('Description (en-US)')
                        ->rows(4),
                ]),
        ];
    }

    private static function planTranslationFields(): array
    {
        if (!self::hasPlanTranslations()) {
            return [];
        }

        return [
            Grid::make()
                ->columns(3)
                ->schema([
                    TextInput::make('name_translations.zh-CN')
                        ->label('Name (zh-CN)')
                        ->maxLength(255),
                    TextInput::make('name_translations.zh-TW')
                        ->label('Name (zh-TW)')
                        ->maxLength(255),
                    TextInput::make('name_translations.en-US')
                        ->label('Name (en-US)')
                        ->maxLength(255),
                ]),
        ];
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('name')->searchable(query: function (Builder $query, string $search): Builder {
                    return $query->where('products.name', 'like', "%{$search}%");
                }),
                TextColumn::make('slug'),
                TextColumn::make('category.name')->searchable(),
            ])
            ->filters([
                SelectFilter::make('category')
                    ->relationship('category', 'name')
                    ->searchable()
                    ->preload(),
            ])
            ->recordActions([
                EditAction::make(),
            ])
            ->defaultSort(function (Builder $query): Builder {
                return $query
                    ->orderBy('sort', 'asc');
            })
            ->defaultGroup('category.name');
    }

    public static function getPages(): array
    {
        return [
            'index' => ListProducts::route('/'),
            'create' => CreateProduct::route('/create'),
            'edit' => EditProduct::route('/{record}/edit'),
        ];
    }
}
