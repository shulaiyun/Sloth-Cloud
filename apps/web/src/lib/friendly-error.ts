import { ApiError } from './api';

type ApiPayloadRecord = Record<string, unknown>;

function asRecord(value: unknown): ApiPayloadRecord {
  return typeof value === 'object' && value !== null ? (value as ApiPayloadRecord) : {};
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

function mapKnownCode(code: string, zh: boolean) {
  switch (code) {
    case 'tfa_required':
      return zh
        ? '\u8be5\u8d26\u6237\u5df2\u542f\u7528\u4e8c\u6b21\u9a8c\u8bc1\uff0c\u8bf7\u8f93\u5165\u9a8c\u8bc1\u7801\u540e\u91cd\u8bd5\u3002'
        : 'Two-factor authentication is enabled. Enter the verification code and retry.';
    case 'SERVICE_CONVOY_MAPPING_MISSING':
      return zh
        ? '\u8be5\u670d\u52a1\u5c1a\u672a\u5b8c\u6210\u670d\u52a1\u5668\u6620\u5c04\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u6216\u8054\u7cfb\u652f\u6301\u3002'
        : 'This service is not mapped to a server yet. Please retry later or contact support.';
    case 'SERVICE_BACKING_VM_MISSING':
      return zh
        ? '\u5f53\u524d\u670d\u52a1\u6620\u5c04\u7684\u540e\u7aef\u865a\u62df\u673a\u4e0d\u5b58\u5728\uff0c\u8bf7\u5728\u5f00\u901a\u72b6\u6001\u533a\u57df\u70b9\u51fb\u201c\u91cd\u8bd5\u5f00\u901a\u201d\u3002'
        : 'The mapped backend VM was not found. Retry provisioning to rebuild the mapping.';
    case 'SERVICE_PROVISIONING_PENDING':
      return zh
        ? '\u670d\u52a1\u6b63\u5728\u5f00\u901a\u4e2d\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002'
        : 'Service provisioning is in progress. Please try again later.';
    case 'SERVICE_PROVISIONING_FAILED':
      return zh
        ? '\u670d\u52a1\u5f00\u901a\u5931\u8d25\uff0c\u8bf7\u5728\u5f00\u901a\u72b6\u6001\u533a\u57df\u53d1\u8d77\u91cd\u8bd5\u3002'
        : 'Provisioning failed. Retry from the provisioning section.';
    case 'SERVICE_SERVER_NOT_READY':
      return zh
        ? '\u670d\u52a1\u5668\u6b63\u5728\u521d\u59cb\u5316\uff0c\u6682\u65f6\u65e0\u6cd5\u6267\u884c\u6b64\u64cd\u4f5c\u3002'
        : 'The server is still initializing and cannot perform this action yet.';
    case 'SERVICE_TEMPLATE_MAPPING_MISSING':
      return zh
        ? '\u670d\u52a1\u672a\u914d\u7f6e\u53ef\u7528\u7684\u91cd\u88c5\u6a21\u677f\uff0c\u8bf7\u8054\u7cfb\u7ba1\u7406\u5458\u8865\u5145\u6a21\u677f\u6620\u5c04\u3002'
        : 'No reinstall template is mapped for this service yet.';
    case 'CONVOY_ACTION_UPSTREAM_FAILURE':
      return zh
        ? 'Convoy \u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002'
        : 'Convoy is temporarily unavailable. Please try again later.';
    case 'SERVICE_ACTION_UNSUPPORTED':
      return zh
        ? '\u5f53\u524d\u670d\u52a1\u6682\u4e0d\u652f\u6301\u8be5\u64cd\u4f5c\u3002'
        : 'This action is not supported for the current service.';
    case 'MANAGED_APP_DISABLED':
      return zh
        ? '\u6258\u7ba1\u5bb9\u5668\u4e91\u529f\u80fd\u6682\u672a\u542f\u7528\u3002'
        : 'Managed App Hosting is currently disabled.';
    case 'MANAGED_APP_RUNTIME_UNAVAILABLE':
      return zh
        ? '\u5e94\u7528\u8fd0\u884c\u73af\u5883\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002'
        : 'The application runtime is temporarily unavailable. Please try again later.';
    case 'MANAGED_APP_ACTION_UNSUPPORTED':
      return zh
        ? '\u5f53\u524d\u5e94\u7528\u6682\u4e0d\u652f\u6301\u8be5\u64cd\u4f5c\u3002'
        : 'This application does not support that action yet.';
    case 'MANAGED_APP_TLS_DOMAIN_REQUIRED':
      return zh
        ? '\u8bf7\u5148\u7ed1\u5b9a\u57df\u540d\u540e\u518d\u5f00\u542f HTTPS\u3002'
        : 'Bind a domain before enabling HTTPS.';
    case 'MANAGED_APP_SCALE_LIMIT_EXCEEDED':
      return zh
        ? '\u6269\u5bb9\u8d85\u51fa\u5957\u9910\u4e0a\u9650\uff0c\u8bf7\u9009\u62e9\u66f4\u9ad8\u7ea7\u5957\u9910\u3002'
        : 'Scaling exceeds the plan limit. Choose a higher tier.';
    case 'MANAGED_APP_GIT_REPO_INVALID':
      return zh
        ? '\u5f53\u524d\u4ec5\u652f\u6301\u53ef\u516c\u5f00\u8bbf\u95ee\u7684 HTTPS Git \u4ed3\u5e93\u3002'
        : 'Only public HTTPS Git repositories are supported.';
    case 'MANAGED_APP_GIT_CLONE_FAILED':
      return zh
        ? '\u4ee3\u7801\u83b7\u53d6\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u4ed3\u5e93\u5730\u5740\u6216\u5206\u652f\u540d\u79f0\u3002'
        : 'Source checkout failed. Check the repository URL or branch name.';
    case 'MANAGED_APP_BUILD_FAILED':
      return zh
        ? '\u5e94\u7528\u6784\u5efa\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002'
        : 'Application build failed. Please retry later.';
    case 'MANAGED_APP_DEPLOY_FAILED':
      return zh
        ? '\u5e94\u7528\u90e8\u7f72\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002'
        : 'Application deployment failed. Please retry later.';
    case 'MANAGED_APP_KUBECTL_FAILED':
      return zh
        ? '\u5e94\u7528\u8fd0\u884c\u73af\u5883\u64cd\u4f5c\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u96c6\u7fa4\u72b6\u6001\u540e\u91cd\u8bd5\u3002'
        : 'The application runtime operation failed. Please check cluster health and retry.';
    default:
      return null;
  }
}

export function toFriendlyError(error: unknown, locale: string) {
  const zh = locale.startsWith('zh');

  if (!(error instanceof ApiError)) {
    if (error instanceof Error) {
      const lower = error.message.toLowerCase();
      if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
        return zh
          ? '\u7f51\u7edc\u8fde\u63a5\u5931\u8d25\uff0c\u65e0\u6cd5\u8bbf\u95ee\u6811\u61d2\u4e91 API\uff0c\u8bf7\u68c0\u67e5\u670d\u52a1\u72b6\u6001\u540e\u91cd\u8bd5\u3002'
          : 'Network request failed. Sloth Cloud API is unreachable. Please retry.';
      }
      if (error.message.trim() !== '') {
        return error.message;
      }
    }

    return zh ? '\u8bf7\u6c42\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002' : 'Request failed. Please try again later.';
  }

  const code = resolveErrorCode(error.payload);
  const validationMessage = resolveValidationMessage(error.payload);

  if (code) {
    const mapped = mapKnownCode(code, zh);
    if (mapped) {
      return mapped;
    }
  }

  if (error.statusCode === 401) {
    return zh ? '\u767b\u5f55\u72b6\u6001\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002' : 'Authentication expired. Please sign in again.';
  }

  if (error.statusCode === 403) {
    return zh ? '\u4f60\u5f53\u524d\u6ca1\u6709\u6743\u9650\u6267\u884c\u8be5\u64cd\u4f5c\u3002' : 'You are not authorized to perform this action.';
  }

  if (error.statusCode === 404) {
    return zh ? '\u8bf7\u6c42\u7684\u8d44\u6e90\u4e0d\u5b58\u5728\u6216\u6682\u4e0d\u53ef\u7528\u3002' : 'The requested resource was not found.';
  }

  if (error.statusCode === 422 && validationMessage) {
    return validationMessage;
  }

  if (error.statusCode === 429) {
    return zh ? '\u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002' : 'Too many requests. Please try again later.';
  }

  if (error.statusCode >= 500) {
    return zh
      ? '\u670d\u52a1\u5668\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002'
      : 'The server is temporarily unavailable. Please try again later.';
  }

  if (error.message.trim() !== '') {
    return error.message;
  }

  return zh ? '\u8bf7\u6c42\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002' : 'Request failed. Please try again later.';
}
