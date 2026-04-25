export type Locale = 'zh-CN' | 'en-US';

type SiteCopy = {
  nav: {
    home: string;
    catalog: string;
    checkout: string;
    services: string;
    affiliate: string;
    invoices: string;
    login: string;
    register: string;
    logout: string;
  };
  common: {
    loading: string;
    error: string;
    pending: string;
    products: string;
    open: string;
    hello: string;
    loginRequired: string;
    customBilling: string;
    stock: string;
    yes: string;
    no: string;
    inspect: string;
    backToCatalog: string;
    status: string;
    total: string;
  };
  footer: {
    statement: string;
  };
  home: {
    secondaryCta: string;
  };
  auth: {
    loginTitle: string;
    email: string;
    password: string;
    code: string;
    submitLogin: string;
    tfaHint: string;
    needAccount: string;
  };
  catalog: {
    noProducts: string;
  };
  product: {
    plans: string;
    summary: string;
    addToCart: string;
    addSuccess: string;
    goCheckout: string;
  };
  services: {
    cancel: string;
    updateLabel: string;
  };
  invoices: {
    noInvoices: string;
  };
  invoiceId: string;
  serviceId: string;
};

const zhCN: SiteCopy = {
  nav: {
    home: '首页',
    catalog: '商店',
    checkout: '结算',
    services: '服务',
    affiliate: '邀请返利',
    invoices: '账单',
    login: '登录',
    register: '注册',
    logout: '退出',
  },
  common: {
    loading: '加载中...',
    error: '请求失败',
    pending: '待处理',
    products: '产品',
    open: '打开',
    hello: '你好',
    loginRequired: '请先登录',
    customBilling: '自定义计费',
    stock: '库存',
    yes: '是',
    no: '否',
    inspect: '查看',
    backToCatalog: '返回产品页',
    status: '状态',
    total: '合计',
  },
  footer: {
    statement: 'Sloth Cloud · VPS 与托管应用平台',
  },
  home: {
    secondaryCta: '立即登录',
  },
  auth: {
    loginTitle: '登录树懒云',
    email: '邮箱',
    password: '密码',
    code: '验证码',
    submitLogin: '登录',
    tfaHint: '请输入双重验证代码后重试。',
    needAccount: '还没有账号？去注册',
  },
  catalog: {
    noProducts: '当前没有可展示的产品。',
  },
  product: {
    plans: '可选方案',
    summary: '订单摘要',
    addToCart: '加入购物车',
    addSuccess: '已加入购物车',
    goCheckout: '前往结算',
  },
  services: {
    cancel: '取消服务',
    updateLabel: '更新名称',
  },
  invoices: {
    noInvoices: '当前没有可展示的账单。',
  },
  invoiceId: '账单编号',
  serviceId: '服务编号',
};

const enUS: SiteCopy = {
  nav: {
    home: 'Home',
    catalog: 'Catalog',
    checkout: 'Checkout',
    services: 'Services',
    affiliate: 'Affiliate',
    invoices: 'Invoices',
    login: 'Login',
    register: 'Register',
    logout: 'Logout',
  },
  common: {
    loading: 'Loading...',
    error: 'Request failed',
    pending: 'Pending',
    products: 'products',
    open: 'Open',
    hello: 'Hello',
    loginRequired: 'Login required',
    customBilling: 'Custom billing',
    stock: 'Stock',
    yes: 'Yes',
    no: 'No',
    inspect: 'Inspect',
    backToCatalog: 'Back to catalog',
    status: 'Status',
    total: 'Total',
  },
  footer: {
    statement: 'Sloth Cloud · VPS and managed app platform',
  },
  home: {
    secondaryCta: 'Sign in',
  },
  auth: {
    loginTitle: 'Sign in to Sloth Cloud',
    email: 'Email',
    password: 'Password',
    code: 'Verification code',
    submitLogin: 'Sign in',
    tfaHint: 'Two-factor verification is required.',
    needAccount: 'Need an account? Register',
  },
  catalog: {
    noProducts: 'No products are currently available.',
  },
  product: {
    plans: 'Plans',
    summary: 'Summary',
    addToCart: 'Add to cart',
    addSuccess: 'Added to cart',
    goCheckout: 'Go to checkout',
  },
  services: {
    cancel: 'Cancel service',
    updateLabel: 'Update label',
  },
  invoices: {
    noInvoices: 'No invoices available.',
  },
  invoiceId: 'Invoice ID',
  serviceId: 'Service ID',
};

export const content: Record<Locale, SiteCopy> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

export const supportedFrontendLocales: Locale[] = ['zh-CN', 'en-US'];

export const localeMeta: Record<Locale, {
  code: string;
  name: string;
  nativeName: string;
  countryCode: string;
}> = {
  'zh-CN': {
    code: 'ZH',
    name: 'Chinese',
    nativeName: '简体中文',
    countryCode: 'CN',
  },
  'en-US': {
    code: 'EN',
    name: 'English',
    nativeName: 'English',
    countryCode: 'US',
  },
};
