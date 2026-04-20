import type { Locale } from './content';

const localeCandidates: Record<Locale, string[]> = {
  'zh-CN': ['zh-CN', 'zh_CN', 'zh', 'cn', 'zh-Hans'],
  'zh-TW': ['zh-TW', 'zh_TW', 'zh-HK', 'zh_MO', 'zh-Hant'],
  'en-US': ['en-US', 'en_GB', 'en', 'us'],
  'ja-JP': ['ja-JP', 'ja_JP', 'ja'],
  'ko-KR': ['ko-KR', 'ko_KR', 'ko'],
  'de-DE': ['de-DE', 'de_DE', 'de'],
  'fr-FR': ['fr-FR', 'fr_FR', 'fr'],
  'es-ES': ['es-ES', 'es_ES', 'es'],
  'ru-RU': ['ru-RU', 'ru_RU', 'ru'],
  'pt-BR': ['pt-BR', 'pt_BR', 'pt'],
};

type LocaleLanguage = 'zh' | 'en' | 'ja' | 'ko';

function localeLanguage(locale: Locale | string): LocaleLanguage {
  const code = locale.toLowerCase().split('-')[0];
  if (code === 'zh' || code === 'ja' || code === 'ko') {
    return code;
  }
  return 'en';
}

const catalogRawOverrides: Record<'ja' | 'ko', Record<string, string>> = {
  ja: {
    'managed app hosting': 'マネージドアプリホスティング',
    'app starter': 'アプリ入門版',
    'app standard': 'アプリ標準版',
    'app pro': 'アプリ上級版',
    'app team': 'アプリチーム版',
    monthly: '月額',
    yearly: '年額',
    annual: '年額',
    'us premium gia vps': '米国プレミアム GIA VPS',
    'us cloud vps': '米国クラウド VPS',
    'hong kong cloud vps': '香港クラウド VPS',
    'us los angeles bgp 1c1g': '米国ロサンゼルス BGP 1C1G',
    'us los angeles bgp 2c2g': '米国ロサンゼルス BGP 2C2G',
    'us los angeles bgp 4c6g': '米国ロサンゼルス BGP 4C6G',
    'us los angeles bgp - 1vcpu/1gb ram': '米国ロサンゼルス BGP - 1vCPU/1GB RAM',
    'hk hong kong bgp 1c1g': '香港 BGP 1C1G',
    'hk hong kong bgp 2c2g': '香港 BGP 2C2G',
    'hk hong kong bgp 4c6g': '香港 BGP 4C6G',
    '1 cpu 1 g 基础套餐': '1 CPU 1G 基本プラン',
    'cpu: 1 vcpu core ram: 1gb ddr4 memory storage: 20gb nvme ssd bandwidth: 1000gb @ 500mbps port network: lax bgp optimized line os: linux distributions support': 'CPU: 1 vCPU / メモリ: 1GB DDR4 / ストレージ: 20GB NVMe SSD / 帯域: 1000GB@500Mbps / 回線: LAX BGP 最適化 / OS: Linux ディストリビューション対応',
    'entry package for small public repository applications with single-replica deployment.': '小規模公開リポジトリアプリ向け。単一レプリカで高速開通。',
    'balanced package for standard production apps with more runtime capacity.': '標準的な本番アプリ向け。より高いランタイム容量を提供。',
    'high-capacity package with horizontal scaling and larger persistent storage.': '水平スケールと大容量永続ストレージに対応する上位プラン。',
    'team-grade package for stateful or multi-instance workloads.': 'ステートフルまたは複数インスタンス向けのチーム向けプラン。',
  },
  ko: {
    'managed app hosting': '매니지드 앱 호스팅',
    'app starter': '앱 스타터',
    'app standard': '앱 스탠다드',
    'app pro': '앱 프로',
    'app team': '앱 팀',
    monthly: '월간',
    yearly: '연간',
    annual: '연간',
    'us premium gia vps': '미국 프리미엄 GIA VPS',
    'us cloud vps': '미국 클라우드 VPS',
    'hong kong cloud vps': '홍콩 클라우드 VPS',
    'us los angeles bgp 1c1g': '미국 로스앤젤레스 BGP 1C1G',
    'us los angeles bgp 2c2g': '미국 로스앤젤레스 BGP 2C2G',
    'us los angeles bgp 4c6g': '미국 로스앤젤레스 BGP 4C6G',
    'us los angeles bgp - 1vcpu/1gb ram': '미국 로스앤젤레스 BGP - 1vCPU/1GB RAM',
    'hk hong kong bgp 1c1g': '홍콩 BGP 1C1G',
    'hk hong kong bgp 2c2g': '홍콩 BGP 2C2G',
    'hk hong kong bgp 4c6g': '홍콩 BGP 4C6G',
    '1 cpu 1 g 基础套餐': '1 CPU 1G 기본 플랜',
    'cpu: 1 vcpu core ram: 1gb ddr4 memory storage: 20gb nvme ssd bandwidth: 1000gb @ 500mbps port network: lax bgp optimized line os: linux distributions support': 'CPU: 1 vCPU / 메모리: 1GB DDR4 / 스토리지: 20GB NVMe SSD / 대역폭: 1000GB @ 500Mbps / 회선: LAX BGP 최적화 / OS: Linux 배포판 지원',
    'entry package for small public repository applications with single-replica deployment.': '소규모 공개 저장소 앱을 위한 입문 패키지로 단일 레플리카에 최적화되었습니다.',
    'balanced package for standard production apps with more runtime capacity.': '표준 프로덕션 앱을 위한 균형형 패키지로 더 넉넉한 런타임 용량을 제공합니다.',
    'high-capacity package with horizontal scaling and larger persistent storage.': '수평 확장과 대용량 영구 스토리지를 지원하는 고성능 패키지입니다.',
    'team-grade package for stateful or multi-instance workloads.': '상태 저장형 또는 다중 인스턴스 워크로드를 위한 팀급 패키지입니다.',
  },
};

function normalizeRawToken(raw: string) {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

function localizeCatalogRaw(raw: string, locale: Locale | string) {
  const language = localeLanguage(locale);
  if (language !== 'ja' && language !== 'ko') {
    return null;
  }

  const normalized = normalizeRawToken(raw);
  const exact = catalogRawOverrides[language][normalized];
  if (exact) {
    return exact;
  }

  const usPrefix = 'us los angeles bgp optimized route with reinstall, power controls, password reset and status sync.';
  if (normalized.startsWith(usPrefix)) {
    const suffix = raw.slice(usPrefix.length).trim();
    return language === 'ja'
      ? `米国ロサンゼルス BGP 最適化回線。再インストール、電源制御、パスワード再設定、状態同期に対応。${suffix ? ` ${suffix}` : ''}`.trim()
      : `미국 로스앤젤레스 BGP 최적화 회선입니다. 재설치, 전원 제어, 비밀번호 재설정, 상태 동기화를 지원합니다.${suffix ? ` ${suffix}` : ''}`.trim();
  }

  const hkPrefix = 'hong kong bgp optimized route for low-latency apac traffic with reinstall and state sync support.';
  if (normalized.startsWith(hkPrefix)) {
    const suffix = raw.slice(hkPrefix.length).trim();
    return language === 'ja'
      ? `香港 BGP 最適化回線。APAC 低遅延向けで、再インストールと状態同期に対応。${suffix ? ` ${suffix}` : ''}`.trim()
      : `홍콩 BGP 최적화 회선입니다. APAC 저지연 트래픽에 적합하며 재설치와 상태 동기화를 지원합니다.${suffix ? ` ${suffix}` : ''}`.trim();
  }

  return null;
}

function parseLocalizedRecord(input: string): Record<string, string> | null {
  const trimmed = input.trim();

  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);

    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      return null;
    }

    const data = Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
      if (typeof value === 'string' && value.trim() !== '') {
        const normalizedKey = key.trim();
        const normalizedValue = value.trim();
        acc[normalizedKey] = normalizedValue;
        acc[normalizedKey.toLowerCase()] = normalizedValue;
      }
      return acc;
    }, {});

    return data;
  } catch {
    return null;
  }
}

function readLocalizedValue(localized: Record<string, string>, key: string) {
  const direct = localized[key];
  if (typeof direct === 'string' && direct !== '') {
    return direct;
  }

  const lowercase = localized[key.toLowerCase()];
  if (typeof lowercase === 'string' && lowercase !== '') {
    return lowercase;
  }

  return null;
}

function fallbackKeysFor(locale: Locale) {
  const zhLocale = locale.toLowerCase().startsWith('zh');
  const languageCode = locale.split('-')[0];
  const localeWithUnderscore = locale.replace('-', '_');

  const keys = [
    ...localeCandidates[locale],
    locale,
    locale.toLowerCase(),
    localeWithUnderscore,
    localeWithUnderscore.toLowerCase(),
    languageCode,
    languageCode.toLowerCase(),
    ...(zhLocale
      ? ['zh-CN', 'zh_TW', 'zh-Hans', 'zh-Hant', 'zh', 'en-US', 'en_GB', 'en']
      : ['en-US', 'en_GB', 'en', 'zh-CN', 'zh-TW', 'zh-Hans', 'zh-Hant', 'zh']),
    'default',
  ];

  return [...new Set(keys)];
}

export function localizeText(raw: string | null | undefined, locale: Locale, fallback = ''): string {
  if (!raw) {
    return fallback;
  }

  const localized = parseLocalizedRecord(raw);
  if (!localized) {
    const override = localizeCatalogRaw(raw, locale);
    return override ?? raw;
  }

  const keys = fallbackKeysFor(locale);
  for (const key of keys) {
    const hit = readLocalizedValue(localized, key);
    if (hit) {
      const override = localizeCatalogRaw(hit, locale);
      return override ?? hit;
    }
  }

  const candidate = Object.values(localized)[0] ?? fallback;
  if (!candidate) {
    return '';
  }

  const override = localizeCatalogRaw(candidate, locale);
  return override ?? candidate;
}
