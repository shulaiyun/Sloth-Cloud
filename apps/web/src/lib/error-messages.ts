import { ApiError } from './api';
import type { Locale, TextContent } from './content';

function startsWithZh(locale: Locale) {
  return locale.startsWith('zh');
}

function parseErrorCode(error: ApiError): string | null {
  const payload = error.payload;
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const value = payload as Record<string, unknown>;
  const code = value.code ?? value.error_code;
  return typeof code === 'string' ? code.trim() : null;
}

export function localizeApiError(error: unknown, text: TextContent, locale: Locale): string {
  if (!(error instanceof ApiError)) {
    return text.common.error;
  }

  const errorCode = parseErrorCode(error)?.toUpperCase() ?? '';

  if (error.statusCode === 500 || error.message === 'HTTP 500') {
    return startsWithZh(locale)
      ? '系统暂时不可用，请稍后重试。'
      : 'The system is temporarily unavailable. Please try again later.';
  }

  if (error.statusCode === 401 || errorCode === 'AUTH_REQUIRED') {
    return startsWithZh(locale)
      ? '登录已失效，请重新登录。'
      : 'Your session has expired. Please sign in again.';
  }

  if (errorCode === 'TFA_REQUIRED') {
    return text.auth.tfaHint;
  }

  if (errorCode === 'SERVICE_CONVOY_MAPPING_MISSING') {
    return text.serviceDetail.mapMissing;
  }

  if (errorCode === 'CONVOY_DISABLED') {
    return text.serviceDetail.convoyDisabled;
  }

  if (errorCode === 'SERVICE_ACTION_UNSUPPORTED') {
    return startsWithZh(locale)
      ? '该服务当前不支持此操作。'
      : 'This operation is not available for the current service.';
  }

  if (error.statusCode === 409 || error.message === 'HTTP 409') {
    return startsWithZh(locale)
      ? '当前请求冲突，请刷新页面后重试。'
      : 'The request conflicts with current state. Refresh and try again.';
  }

  return error.message;
}
