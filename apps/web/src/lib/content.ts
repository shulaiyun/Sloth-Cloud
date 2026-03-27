export const localeMeta = {
  'zh-CN': { code: 'CN', label: '\u4E2D\u6587' },
  'zh-TW': { code: 'TW', label: '\u7E41\u9AD4\u4E2D\u6587' },
  'en-US': { code: 'US', label: 'English' },
  'de-DE': { code: 'DE', label: 'Deutsch' },
  'fr-FR': { code: 'FR', label: 'Francais' },
  'es-ES': { code: 'ES', label: 'Espanol' },
  'ko-KR': { code: 'KR', label: '\uD55C\uAD6D\uC5B4' },
} as const;

export type Locale = keyof typeof localeMeta;

export type TextContent = {
  nav: {
    home: string;
    catalog: string;
    cart: string;
    checkout: string;
    services: string;
    invoices: string;
    login: string;
    register: string;
    logout: string;
  };
  common: {
    loading: string;
    error: string;
    backToCatalog: string;
    sourceMode: string;
    mock: string;
    live: string;
    themeDark: string;
    themeLight: string;
    empty: string;
    loginRequired: string;
    hello: string;
    view: string;
    open: string;
    inspect: string;
    stock: string;
    products: string;
    defaultPlan: string;
    customBilling: string;
    yes: string;
    no: string;
    pending: string;
    slug: string;
    allowQuantity: string;
    perUserLimit: string;
    submit: string;
    remove: string;
    quantity: string;
    status: string;
    total: string;
  };
  home: {
    kicker: string;
    title: string;
    subtitle: string;
    primaryCta: string;
    secondaryCta: string;
    featuredTitle: string;
    featuredSubtitle: string;
    categoryTitle: string;
    categorySubtitle: string;
  };
  catalog: {
    title: string;
    subtitle: string;
    allProducts: string;
    noProducts: string;
  };
  product: {
    summary: string;
    plans: string;
    config: string;
    os: string;
    details: string;
    loginHint: string;
    configEmpty: string;
    addToCart: string;
    addSuccess: string;
    goCheckout: string;
  };
  checkout: {
    title: string;
    subtitle: string;
    empty: string;
    coupon: string;
    couponHint: string;
    placeOrder: string;
    placingOrder: string;
    orderCreated: string;
    redirectTo: string;
  };
  services: {
    title: string;
    subtitle: string;
    noServices: string;
    updateLabel: string;
    cancel: string;
  };
  invoices: {
    title: string;
    subtitle: string;
    noInvoices: string;
    payWithCredit: string;
    payWithGateway: string;
  };
  auth: {
    loginTitle: string;
    loginSubtitle: string;
    registerTitle: string;
    registerSubtitle: string;
    email: string;
    password: string;
    code: string;
    firstName: string;
    lastName: string;
    passwordConfirmation: string;
    submitLogin: string;
    submitRegister: string;
    tfaHint: string;
    alreadyHaveAccount: string;
    needAccount: string;
  };
  footer: {
    statement: string;
  };
};

const enUs: TextContent = {
  nav: { home: 'Home', catalog: 'Store', cart: 'Cart', checkout: 'Checkout', services: 'Services', invoices: 'Invoices', login: 'Login', register: 'Register', logout: 'Logout' },
  common: {
    loading: 'Loading Sloth Cloud data...',
    error: 'Request failed',
    backToCatalog: 'Back to store',
    sourceMode: 'Data source',
    mock: 'Demo mode',
    live: 'Live data',
    themeDark: 'Dark',
    themeLight: 'Light',
    empty: 'Nothing to show yet',
    loginRequired: 'Continue with login',
    hello: 'Hello',
    view: 'View',
    open: 'Open',
    inspect: 'Inspect',
    stock: 'Stock',
    products: 'products',
    defaultPlan: 'Default plan',
    customBilling: 'Custom billing',
    yes: 'Yes',
    no: 'No',
    pending: 'Pending',
    slug: 'Slug',
    allowQuantity: 'Allow quantity',
    perUserLimit: 'Per-user limit',
    submit: 'Submit',
    remove: 'Remove',
    quantity: 'Quantity',
    status: 'Status',
    total: 'Total',
  },
  home: {
    kicker: 'Sloth Cloud Headless Client',
    title: 'Built like a premium VPS storefront, not a default panel skin',
    subtitle: 'A modern customer experience powered by a headless billing core and edge BFF.',
    primaryCta: 'Browse store',
    secondaryCta: 'Sign in',
    featuredTitle: 'Live products',
    featuredSubtitle: 'Rendered from the new headless catalog endpoints.',
    categoryTitle: 'Live categories',
    categorySubtitle: 'Categories and prices are no longer tied to old Livewire pages.',
  },
  catalog: { title: 'Store / Categories', subtitle: 'Browse real products by category.', allProducts: 'All products', noProducts: 'No products are available in this category yet.' },
  product: {
    summary: 'Configuration summary',
    plans: 'Billing plans',
    config: 'Configuration',
    os: 'Operating systems',
    details: 'Product detail',
    loginHint: 'Sign in first to continue into the order flow.',
    configEmpty: 'This product currently has no extra config options.',
    addToCart: 'Add to cart',
    addSuccess: 'Added to cart successfully.',
    goCheckout: 'Go to checkout',
  },
  checkout: {
    title: 'Checkout',
    subtitle: 'Review cart items, coupon, and complete order creation.',
    empty: 'Your cart is currently empty.',
    coupon: 'Coupon',
    couponHint: 'Enter a coupon code and apply.',
    placeOrder: 'Place order',
    placingOrder: 'Placing order...',
    orderCreated: 'Order created successfully.',
    redirectTo: 'Open target',
  },
  services: { title: 'My services', subtitle: 'Manage purchased services and view runtime details.', noServices: 'No services yet.', updateLabel: 'Update label', cancel: 'Cancel service' },
  invoices: { title: 'My invoices', subtitle: 'Track invoice status and complete payment.', noInvoices: 'No invoices yet.', payWithCredit: 'Pay with credit', payWithGateway: 'Pay with gateway' },
  auth: {
    loginTitle: 'Sign in to Sloth Cloud',
    loginSubtitle: 'Use Paymenter headless auth through the BFF session.',
    registerTitle: 'Create your Sloth Cloud account',
    registerSubtitle: 'Registration signs you in automatically.',
    email: 'Email',
    password: 'Password',
    code: 'Two-factor code',
    firstName: 'First name',
    lastName: 'Last name',
    passwordConfirmation: 'Confirm password',
    submitLogin: 'Sign in',
    submitRegister: 'Create account',
    tfaHint: 'Two-factor authentication is enabled. Enter your code and submit again.',
    alreadyHaveAccount: 'Already have an account? Sign in',
    needAccount: 'Need an account? Register',
  },
  footer: { statement: 'Sloth Cloud storefront. Headless auth and catalog are now powered by the edge BFF.' },
};

const zhCn: TextContent = {
  ...enUs,
  nav: { home: '\u9996\u9875', catalog: '\u5546\u5E97', cart: '\u8D2D\u7269\u8F66', checkout: '\u7ED3\u7B97', services: '\u670D\u52A1', invoices: '\u8D26\u5355', login: '\u767B\u5F55', register: '\u6CE8\u518C', logout: '\u9000\u51FA' },
  common: {
    ...enUs.common,
    loading: '\u6B63\u5728\u52A0\u8F7D\u6811\u61D2\u4E91\u6570\u636E...',
    error: '\u8BF7\u6C42\u5931\u8D25',
    backToCatalog: '\u8FD4\u56DE\u5546\u5E97',
    mock: '\u6F14\u793A\u6A21\u5F0F',
    live: '\u771F\u5B9E\u6570\u636E',
    themeDark: '\u9ED1\u6697',
    themeLight: '\u660E\u4EAE',
    loginRequired: '\u8BF7\u5148\u767B\u5F55',
    hello: '\u4F60\u597D',
    view: '\u67E5\u770B',
    inspect: '\u8BE6\u60C5',
    stock: '\u5E93\u5B58',
    products: '\u4E2A\u4EA7\u54C1',
    defaultPlan: '\u9ED8\u8BA4\u5957\u9910',
    customBilling: '\u81EA\u5B9A\u4E49\u5468\u671F',
    pending: '\u5F85\u5904\u7406',
    slug: '\u6807\u8BC6',
    allowQuantity: '\u6570\u91CF\u6A21\u5F0F',
    perUserLimit: '\u5355\u7528\u6237\u9650\u5236',
    submit: '\u63D0\u4EA4',
    remove: '\u79FB\u9664',
    quantity: '\u6570\u91CF',
    status: '\u72B6\u6001',
    total: '\u603B\u8BA1',
  },
  home: {
    kicker: '\u6811\u61D2\u4E91 Headless \u5BA2\u6237\u7AEF',
    title: '\u66F4\u50CF\u4E13\u4E1A VPS \u670D\u52A1\u5546\uFF0C\u800C\u4E0D\u662F\u9ED8\u8BA4\u9762\u677F\u76AE\u80A4',
    subtitle: '\u73B0\u4EE3\u54C1\u724C\u4F53\u9A8C\uFF0CHeadless \u8BA1\u8D39\u6838\u5FC3\uFF0C\u957F\u671F\u53EF\u6269\u5C55\u67B6\u6784\u3002',
    primaryCta: '\u8FDB\u5165\u5546\u5E97',
    secondaryCta: '\u7ACB\u5373\u767B\u5F55',
    featuredTitle: '\u771F\u5B9E\u5546\u54C1',
    featuredSubtitle: '\u6765\u81EA\u65B0\u7684 Headless \u5546\u54C1\u63A5\u53E3\u3002',
    categoryTitle: '\u771F\u5B9E\u5206\u7C7B',
    categorySubtitle: '\u5206\u7C7B\u548C\u4EF7\u683C\u4E0D\u518D\u7ED1\u5B9A\u65E7 Livewire \u9875\u9762\u3002',
  },
  catalog: { title: '\u5546\u5E97 / \u5206\u7C7B', subtitle: '\u6309\u5206\u7C7B\u6D4F\u89C8\u771F\u5B9E\u5546\u54C1\u3002', allProducts: '\u5168\u90E8\u4EA7\u54C1', noProducts: '\u5F53\u524D\u5206\u7C7B\u4E0B\u6682\u65E0\u5546\u54C1\u3002' },
  product: { ...enUs.product, summary: '\u8D2D\u4E70\u6982\u89C8', plans: '\u8BA1\u8D39\u5468\u671F', config: '\u8D2D\u4E70\u914D\u7F6E', os: '\u64CD\u4F5C\u7CFB\u7EDF', details: '\u4EA7\u54C1\u8BE6\u60C5', loginHint: '\u767B\u5F55\u540E\u5373\u53EF\u7EE7\u7EED\u5B8C\u6574\u4E0B\u5355\u6D41\u7A0B\u3002', configEmpty: '\u8BE5\u5546\u54C1\u5F53\u524D\u6CA1\u6709\u989D\u5916\u914D\u7F6E\u9879\u3002', addToCart: '\u52A0\u5165\u8D2D\u7269\u8F66', addSuccess: '\u5DF2\u52A0\u5165\u8D2D\u7269\u8F66\u3002', goCheckout: '\u524D\u5F80\u7ED3\u7B97' },
  checkout: { ...enUs.checkout, title: '\u7ED3\u7B97', subtitle: '\u786E\u8BA4\u8D2D\u7269\u8F66\u3001\u4F18\u60E0\u7801\u5E76\u63D0\u4EA4\u8BA2\u5355\u3002', empty: '\u4F60\u7684\u8D2D\u7269\u8F66\u5F53\u524D\u4E3A\u7A7A\u3002', coupon: '\u4F18\u60E0\u7801', couponHint: '\u8F93\u5165\u4F18\u60E0\u7801\u540E\u70B9\u51FB\u5E94\u7528\u3002', placeOrder: '\u63D0\u4EA4\u8BA2\u5355', placingOrder: '\u6B63\u5728\u4E0B\u5355...', orderCreated: '\u8BA2\u5355\u521B\u5EFA\u6210\u529F\u3002', redirectTo: '\u6253\u5F00\u76EE\u6807\u9875' },
  services: { ...enUs.services, title: '\u6211\u7684\u670D\u52A1', subtitle: '\u7BA1\u7406\u5DF2\u8D2D\u670D\u52A1\u5E76\u67E5\u770B\u8BE6\u60C5\u3002', noServices: '\u6682\u65E0\u670D\u52A1\u3002', updateLabel: '\u66F4\u65B0\u540D\u79F0', cancel: '\u53D6\u6D88\u670D\u52A1' },
  invoices: { ...enUs.invoices, title: '\u6211\u7684\u8D26\u5355', subtitle: '\u67E5\u770B\u8D26\u5355\u72B6\u6001\u5E76\u5B8C\u6210\u652F\u4ED8\u3002', noInvoices: '\u6682\u65E0\u8D26\u5355\u3002', payWithCredit: '\u4F59\u989D\u652F\u4ED8', payWithGateway: '\u7F51\u5173\u652F\u4ED8' },
  auth: { ...enUs.auth, loginTitle: '\u767B\u5F55\u6811\u61D2\u4E91', loginSubtitle: '\u901A\u8FC7 BFF \u4F1A\u8BDD\u8FDE\u63A5 Paymenter Headless \u8BA4\u8BC1\u3002', registerTitle: '\u521B\u5EFA\u6811\u61D2\u4E91\u8D26\u53F7', registerSubtitle: '\u6CE8\u518C\u6210\u529F\u540E\u81EA\u52A8\u767B\u5F55\u3002', email: '\u90AE\u7BB1', password: '\u5BC6\u7801', code: '\u53CC\u91CD\u9A8C\u8BC1\u7801', firstName: '\u540D\u5B57', lastName: '\u59D3\u6C0F', passwordConfirmation: '\u786E\u8BA4\u5BC6\u7801', submitLogin: '\u767B\u5F55', submitRegister: '\u6CE8\u518C', tfaHint: '\u68C0\u6D4B\u5230\u53CC\u91CD\u9A8C\u8BC1\uFF0C\u8BF7\u8F93\u5165\u9A8C\u8BC1\u7801\u540E\u91CD\u8BD5\u3002', alreadyHaveAccount: '\u5DF2\u6709\u8D26\u53F7\uFF1F\u53BB\u767B\u5F55', needAccount: '\u8FD8\u6CA1\u6709\u8D26\u53F7\uFF1F\u53BB\u6CE8\u518C' },
  footer: { statement: '\u6811\u61D2\u4E91\u524D\u53F0\u3002\u771F\u5B9E\u8BA4\u8BC1\u3001\u76EE\u5F55\u3001\u7ED3\u7B97\u94FE\u8DEF\u5DF2\u901A\u8FC7\u8FB9\u7F18 BFF \u63A5\u5165\u3002' },
};

const zhTw: TextContent = {
  ...zhCn,
  nav: { home: '\u9996\u9801', catalog: '\u5546\u5E97', cart: '\u8CFC\u7269\u8ECA', checkout: '\u7D50\u7B97', services: '\u670D\u52D9', invoices: '\u5E33\u55AE', login: '\u767B\u5165', register: '\u8A3B\u518A', logout: '\u767B\u51FA' },
  common: { ...zhCn.common, loading: '\u6B63\u5728\u8F09\u5165\u6A39\u61F6\u96F2\u8CC7\u6599...', products: '\u500B\u7522\u54C1', customBilling: '\u81EA\u8A02\u9031\u671F' },
  home: { ...zhCn.home, title: '\u66F4\u50CF\u5C08\u696D VPS \u670D\u52D9\u5546\uFF0C\u800C\u4E0D\u662F\u9810\u8A2D\u9762\u677F\u76AE\u819A' },
};

const deDe: TextContent = { ...enUs, nav: { ...enUs.nav, home: 'Start', catalog: 'Shop', cart: 'Warenkorb', checkout: 'Kasse', services: 'Dienste', invoices: 'Rechnungen', login: 'Anmelden', register: 'Registrieren', logout: 'Abmelden' }, home: { ...enUs.home, title: 'Wie ein professioneller VPS-Anbieter, nicht wie ein Standard-Panel', subtitle: 'Moderne Kundenerfahrung mit Headless Billing Core und BFF.' } };
const frFr: TextContent = { ...enUs, nav: { ...enUs.nav, home: 'Accueil', catalog: 'Boutique', cart: 'Panier', checkout: 'Paiement', services: 'Services', invoices: 'Factures', login: 'Connexion', register: 'Inscription', logout: 'Deconnexion' }, home: { ...enUs.home, title: 'Une vitrine VPS pro, pas un theme de panel par defaut', subtitle: 'Experience moderne basee sur un coeur de facturation headless.' } };
const esEs: TextContent = { ...enUs, nav: { ...enUs.nav, home: 'Inicio', catalog: 'Tienda', cart: 'Carrito', checkout: 'Pago', services: 'Servicios', invoices: 'Facturas', login: 'Entrar', register: 'Registro', logout: 'Salir' }, home: { ...enUs.home, title: 'Como un proveedor VPS profesional, no un panel basico', subtitle: 'Experiencia moderna con facturacion headless y BFF de borde.' } };
const koKr: TextContent = { ...enUs, nav: { ...enUs.nav, home: '\uD648', catalog: '\uC2A4\uD1A0\uC5B4', cart: '\uC7A5\uBC14\uAD6C\uB2C8', checkout: '\uACB0\uC81C', services: '\uC11C\uBE44\uC2A4', invoices: '\uCCAD\uAD6C\uC11C', login: '\uB85C\uADF8\uC778', register: '\uD68C\uC6D0\uAC00\uC785', logout: '\uB85C\uADF8\uC544\uC6C3' }, home: { ...enUs.home, title: '\uAE30\uBCF8 \uD328\uB110\uC774 \uC544\uB2CC \uC804\uBB38 VPS \uC2A4\uD1A0\uC5B4', subtitle: '\uD5E4\uB4DC\uB9AC\uC2A4 \uACFC\uAE08 \uCF54\uC5B4\uC640 BFF \uAE30\uBC18 \uACBD\uD5D8' } };

export const content: Record<Locale, TextContent> = {
  'zh-CN': zhCn,
  'zh-TW': zhTw,
  'en-US': enUs,
  'de-DE': deDe,
  'fr-FR': frFr,
  'es-ES': esEs,
  'ko-KR': koKr,
};
