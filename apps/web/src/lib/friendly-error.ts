import { ApiError } from './api';

type ApiPayloadRecord = Record<string, unknown>;
type SupportedLanguage = 'zh' | 'en' | 'ja' | 'ko';
type LocalizedMessage = {
  zh: string;
  en: string;
  ja?: string;
  ko?: string;
};

function asRecord(value: unknown): ApiPayloadRecord {
  return typeof value === 'object' && value !== null ? (value as ApiPayloadRecord) : {};
}

function localeLanguage(locale: string): SupportedLanguage {
  const language = locale.toLowerCase().split('-')[0];
  if (language === 'zh' || language === 'ja' || language === 'ko') {
    return language;
  }

  return 'en';
}

function localize(locale: string, message: LocalizedMessage) {
  const language = localeLanguage(locale);
  if (language === 'ja' && message.ja) return message.ja;
  if (language === 'ko' && message.ko) return message.ko;
  if (language === 'zh') return message.zh;
  return message.en;
}

function resolveErrorCode(payload: unknown) {
  const record = asRecord(payload);
  const code = record.code ?? record.error_code;
  return typeof code === 'string' ? code : null;
}

function resolveValidationMessage(payload: unknown) {
  const record = asRecord(payload);
  const errors = asRecord(record.errors);
  const firstEntry = Object.values(errors)[0];

  if (Array.isArray(firstEntry) && typeof firstEntry[0] === 'string') {
    return firstEntry[0];
  }

  return null;
}

function mapKnownCode(code: string, locale: string) {
  switch (code) {
    case 'tfa_required':
      return localize(locale, {
        zh: '该账户已启用二次验证，请输入验证码后重试。',
        en: 'Two-factor authentication is enabled. Enter the verification code and retry.',
        ja: 'このアカウントは二段階認証が有効です。認証コードを入力して再試行してください。',
        ko: '이 계정은 2단계 인증이 활성화되어 있습니다. 인증 코드를 입력한 뒤 다시 시도해 주세요.',
      });
    case 'SERVICE_CONVOY_MAPPING_MISSING':
      return localize(locale, {
        zh: '该服务尚未完成服务器映射，请稍后重试或联系支持。',
        en: 'This service is not mapped to a server yet. Please retry later or contact support.',
        ja: 'このサービスはまだサーバーにマッピングされていません。しばらくして再試行するかサポートへ連絡してください。',
        ko: '이 서비스는 아직 서버에 매핑되지 않았습니다. 잠시 후 다시 시도하거나 고객지원에 문의해 주세요.',
      });
    case 'SERVICE_BACKING_VM_MISSING':
      return localize(locale, {
        zh: '当前服务映射的后端虚拟机不存在，请在开通状态区域点击“重试开通”。',
        en: 'The mapped backend VM was not found. Retry provisioning to rebuild the mapping.',
        ja: 'マッピングされたバックエンド VM が見つかりません。開通再試行でマッピングを再構築してください。',
        ko: '매핑된 백엔드 VM을 찾을 수 없습니다. 개통 재시도로 매핑을 다시 생성해 주세요.',
      });
    case 'SERVICE_PROVISIONING_PENDING':
      return localize(locale, {
        zh: '服务正在开通中，请稍后重试。',
        en: 'Service provisioning is in progress. Please try again later.',
        ja: 'サービスは開通処理中です。しばらくして再試行してください。',
        ko: '서비스 개통이 진행 중입니다. 잠시 후 다시 시도해 주세요.',
      });
    case 'SERVICE_PROVISIONING_FAILED':
      return localize(locale, {
        zh: '服务开通失败，请在开通状态区域发起重试。',
        en: 'Provisioning failed. Retry from the provisioning section.',
        ja: 'サービス開通に失敗しました。開通ステータスから再試行してください。',
        ko: '서비스 개통에 실패했습니다. 개통 상태 영역에서 재시도해 주세요.',
      });
    case 'SERVICE_SERVER_NOT_READY':
      return localize(locale, {
        zh: '服务器正在初始化，暂时无法执行此操作。',
        en: 'The server is still initializing and cannot perform this action yet.',
        ja: 'サーバーは初期化中のため、この操作はまだ実行できません。',
        ko: '서버가 초기화 중이어서 아직 이 작업을 실행할 수 없습니다.',
      });
    case 'SERVICE_TEMPLATE_MAPPING_MISSING':
      return localize(locale, {
        zh: '服务未配置可用的重装模板，请联系管理员补充模板映射。',
        en: 'No reinstall template is mapped for this service yet.',
        ja: 'このサービスに再インストールテンプレートがマッピングされていません。',
        ko: '이 서비스에는 재설치 템플릿이 아직 매핑되어 있지 않습니다.',
      });
    case 'CONVOY_ACTION_UPSTREAM_FAILURE':
      return localize(locale, {
        zh: 'Convoy 暂时不可用，请稍后重试。',
        en: 'Convoy is temporarily unavailable. Please try again later.',
        ja: 'Convoy が一時的に利用できません。しばらくして再試行してください。',
        ko: 'Convoy를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
      });
    case 'SERVICE_ACTION_UNSUPPORTED':
      return localize(locale, {
        zh: '当前服务暂不支持该操作。',
        en: 'This action is not supported for the current service.',
        ja: 'このサービスでは現在この操作をサポートしていません。',
        ko: '현재 서비스에서는 이 작업을 지원하지 않습니다.',
      });
    case 'MANAGED_APP_DISABLED':
      return localize(locale, {
        zh: 'AI 托管运行环境暂未启用。',
        en: 'The AI managed runtime is currently disabled.',
        ja: 'AI マネージド実行環境は現在無効です。',
        ko: 'AI 관리형 런타임이 현재 비활성화되어 있습니다.',
      });
    case 'MANAGED_APP_RUNTIME_UNAVAILABLE':
      return localize(locale, {
        zh: '应用运行环境暂时不可用，请稍后重试。',
        en: 'The application runtime is temporarily unavailable. Please try again later.',
        ja: 'アプリ実行環境が一時的に利用できません。しばらくして再試行してください。',
        ko: '애플리케이션 런타임을 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
      });
    case 'MANAGED_APP_ACTION_UNSUPPORTED':
      return localize(locale, {
        zh: '当前应用暂不支持该操作。',
        en: 'This application does not support that action yet.',
        ja: 'このアプリではまだこの操作をサポートしていません。',
        ko: '현재 애플리케이션에서는 이 작업을 지원하지 않습니다.',
      });
    case 'MANAGED_APP_TLS_DOMAIN_REQUIRED':
      return localize(locale, {
        zh: '请先绑定域名后再开启 HTTPS。',
        en: 'Bind a domain before enabling HTTPS.',
        ja: 'HTTPS を有効化する前にドメインを設定してください。',
        ko: 'HTTPS를 활성화하기 전에 도메인을 먼저 연결해 주세요.',
      });
    case 'MANAGED_APP_SCALE_LIMIT_EXCEEDED':
      return localize(locale, {
        zh: '扩容超出套餐上限，请选择更高级套餐。',
        en: 'Scaling exceeds the plan limit. Choose a higher tier.',
        ja: 'スケール数がプラン上限を超えています。上位プランをご利用ください。',
        ko: '확장 수가 요금제 한도를 초과했습니다. 상위 플랜을 선택해 주세요.',
      });
    case 'MANAGED_APP_GIT_REPO_INVALID':
      return localize(locale, {
        zh: '当前仅支持可公开访问的 HTTPS Git 仓库。',
        en: 'Only public HTTPS Git repositories are supported.',
        ja: '公開アクセス可能な HTTPS Git リポジトリのみ対応しています。',
        ko: '공개 접근 가능한 HTTPS Git 저장소만 지원합니다.',
      });
    case 'MANAGED_APP_GIT_CLONE_FAILED':
      return localize(locale, {
        zh: '代码获取失败，请检查仓库地址或分支名称。',
        en: 'Source checkout failed. Check the repository URL or branch name.',
        ja: 'ソース取得に失敗しました。リポジトリ URL またはブランチ名を確認してください。',
        ko: '소스 체크아웃에 실패했습니다. 저장소 URL 또는 브랜치명을 확인해 주세요.',
      });
    case 'MANAGED_APP_BUILD_FAILED':
      return localize(locale, {
        zh: '应用构建失败，请稍后重试。',
        en: 'Application build failed. Please retry later.',
        ja: 'アプリのビルドに失敗しました。しばらくして再試行してください。',
        ko: '애플리케이션 빌드에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      });
    case 'MANAGED_APP_DEPLOY_FAILED':
      return localize(locale, {
        zh: '应用部署失败，请稍后重试。',
        en: 'Application deployment failed. Please retry later.',
        ja: 'アプリのデプロイに失敗しました。しばらくして再試行してください。',
        ko: '애플리케이션 배포에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      });
    case 'MANAGED_APP_KUBECTL_FAILED':
      return localize(locale, {
        zh: '应用运行环境操作失败，请检查集群状态后重试。',
        en: 'The application runtime operation failed. Please check cluster health and retry.',
        ja: 'アプリ実行環境の操作に失敗しました。クラスタ状態を確認して再試行してください。',
        ko: '애플리케이션 런타임 작업에 실패했습니다. 클러스터 상태를 확인한 뒤 다시 시도해 주세요.',
      });
    default:
      return null;
  }
}

export function toFriendlyError(error: unknown, locale: string) {
  const internalFailureMessage = localize(locale, {
    zh: '服务暂时不可用，请稍后重试；若持续出现，请联系技术支持。',
    en: 'The service is temporarily unavailable. Please try again later or contact support.',
    ja: 'サービスは一時的に利用できません。しばらくして再試行するか、サポートへ連絡してください。',
    ko: '서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도하거나 기술지원에 문의해 주세요.',
  });
  const upstreamUnavailableMessage = localize(locale, {
    zh: '上游资源服务暂时不可用，请稍后重试。',
    en: 'The upstream infrastructure service is temporarily unavailable. Please try again later.',
    ja: '上流インフラサービスが一時的に利用できません。しばらくして再試行してください。',
    ko: '업스트림 인프라 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  });

  const rawMessage = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : '';
  const rawLower = rawMessage.toLowerCase();

  if (
    rawLower.includes('/var/www/html/storage/logs')
    || rawLower.includes('laravel-20')
    || (rawLower.includes('permission denied') && rawLower.includes('storage/logs'))
  ) {
    return internalFailureMessage;
  }

  if (
    rawLower.includes('curl error')
    || rawLower.includes('connection refused')
    || rawLower.includes('failed to connect')
    || rawLower.includes('could not resolve host')
  ) {
    return upstreamUnavailableMessage;
  }

  if (
    rawLower.includes('provisioning_mapping_not_found')
    || rawLower.includes('no provisioning mapping found')
  ) {
    return localize(locale, {
      zh: '当前商品尚未完成开通映射配置，请联系支持处理。',
      en: 'This product is not fully configured for provisioning yet. Please contact support.',
      ja: 'この商品はまだ開通マッピング設定が未完了です。サポートへ連絡してください。',
      ko: '이 상품은 아직 프로비저닝 매핑 구성이 완료되지 않았습니다. 고객지원에 문의해 주세요.',
    });
  }

  if (
    rawLower.includes('current account password is incorrect')
    || rawLower.includes('current password is incorrect')
  ) {
    return localize(locale, {
      zh: '账号密码不正确，请重新输入当前登录账号的密码后再确认取消。',
      en: 'The account password is incorrect. Re-enter the current login password to confirm cancellation.',
      ja: 'アカウントパスワードが正しくありません。現在のログインパスワードを再入力して解約を確認してください。',
      ko: '계정 비밀번호가 올바르지 않습니다. 현재 로그인 비밀번호를 다시 입력한 뒤 해지를 확인해 주세요.',
    });
  }

  if (
    rawLower.includes('current password') && (
      rawLower.includes('required')
      || rawLower.includes('必填')
      || rawLower.includes('欄位是必填')
    )
  ) {
    return localize(locale, {
      zh: '取消服务需要输入当前账号密码。',
      en: 'Current account password is required to cancel this service.',
      ja: 'サービス解約には現在のアカウントパスワードが必要です。',
      ko: '서비스 해지에는 현재 계정 비밀번호가 필요합니다.',
    });
  }

  if (
    rawLower.includes('confirm password')
    || rawLower.includes('password confirmation')
    || rawLower.includes('password_confirmation')
  ) {
    return localize(locale, {
      zh: '请同时填写并确认自定义服务器密码，两次密码必须一致。',
      en: 'Please enter and confirm the custom server password. Both values must match.',
      ja: 'カスタムサーバーパスワードと確認用パスワードを入力し、両方を一致させてください。',
      ko: '사용자 지정 서버 비밀번호와 확인 비밀번호를 모두 입력하고 두 값이 일치해야 합니다.',
    });
  }

  if (!(error instanceof ApiError)) {
    if (error instanceof Error) {
      const lower = error.message.toLowerCase();
      if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
        return localize(locale, {
          zh: '网络连接失败，无法访问树懒云 API，请检查服务状态后重试。',
          en: 'Network request failed. Sloth Cloud API is unreachable. Please retry.',
          ja: 'ネットワーク接続に失敗し、Sloth Cloud API へアクセスできません。サービス状態を確認して再試行してください。',
          ko: '네트워크 연결에 실패하여 Sloth Cloud API에 접근할 수 없습니다. 서비스 상태를 확인한 뒤 다시 시도해 주세요.',
        });
      }
      if (error.message.trim() !== '') {
        return error.message;
      }
    }

    return localize(locale, {
      zh: '请求失败，请稍后重试。',
      en: 'Request failed. Please try again later.',
      ja: 'リクエストに失敗しました。しばらくして再試行してください。',
      ko: '요청에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    });
  }

  const code = resolveErrorCode(error.payload);
  const validationMessage = resolveValidationMessage(error.payload);

  if (code) {
    const mapped = mapKnownCode(code, locale);
    if (mapped) {
      return mapped;
    }
  }

  if (error.statusCode === 401) {
    return localize(locale, {
      zh: '登录状态已失效，请重新登录。',
      en: 'Authentication expired. Please sign in again.',
      ja: '認証が期限切れです。再度ログインしてください。',
      ko: '인증이 만료되었습니다. 다시 로그인해 주세요.',
    });
  }

  if (error.statusCode === 403) {
    return localize(locale, {
      zh: '你当前没有权限执行该操作。',
      en: 'You are not authorized to perform this action.',
      ja: 'この操作を実行する権限がありません。',
      ko: '이 작업을 수행할 권한이 없습니다.',
    });
  }

  if (error.statusCode === 404) {
    return localize(locale, {
      zh: '请求的资源不存在或暂不可用。',
      en: 'The requested resource was not found.',
      ja: '要求されたリソースが存在しないか、一時的に利用できません。',
      ko: '요청한 리소스가 없거나 일시적으로 사용할 수 없습니다.',
    });
  }

  if (error.statusCode === 422 && validationMessage) {
    return validationMessage;
  }

  if (error.statusCode === 429) {
    return localize(locale, {
      zh: '请求过于频繁，请稍后再试。',
      en: 'Too many requests. Please try again later.',
      ja: 'リクエストが多すぎます。しばらくして再試行してください。',
      ko: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    });
  }

  if (error.statusCode >= 500) {
    return localize(locale, {
      zh: '服务器暂时不可用，请稍后重试。',
      en: 'The server is temporarily unavailable. Please try again later.',
      ja: 'サーバーは一時的に利用できません。しばらくして再試行してください。',
      ko: '서버를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    });
  }

  if (error.message.trim() !== '') {
    return error.message;
  }

  return localize(locale, {
    zh: '请求失败，请稍后重试。',
    en: 'Request failed. Please try again later.',
    ja: 'リクエストに失敗しました。しばらくして再試行してください。',
    ko: '요청에 실패했습니다. 잠시 후 다시 시도해 주세요.',
  });
}
