import { ApiError } from './api';

function isChineseLocale(locale: string) {
  return locale.toLowerCase().startsWith('zh');
}

function normalizeErrorMessage(error: Error) {
  const message = error.message.trim();
  return message.length > 0 ? message : 'Unknown error';
}

export function toFriendlyError(error: unknown, locale = 'en') {
  const zh = isChineseLocale(locale);

  if (error instanceof ApiError) {
    if (error.statusCode === 401) {
      return zh ? '登录状态已失效，请重新登录。' : 'Your session has expired. Please sign in again.';
    }
    if (error.statusCode === 403) {
      return zh ? '当前账号没有权限执行这个操作。' : 'Your account does not have permission for this action.';
    }
    if (error.statusCode === 404) {
      return zh ? '目标资源不存在或已被删除。' : 'The requested resource was not found.';
    }
    if (error.statusCode >= 500) {
      return zh ? '服务器暂时不可用，请稍后重试。' : 'The server is temporarily unavailable. Please try again.';
    }
    return normalizeErrorMessage(error);
  }

  if (error instanceof Error) {
    const message = normalizeErrorMessage(error);
    if (/network|fetch|connection|ECONNREFUSED/i.test(message)) {
      return zh ? '服务器暂时不可用，请稍后重试。' : 'The server is temporarily unavailable. Please try again.';
    }
    return message;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim();
  }

  return zh ? '发生未知错误，请稍后重试。' : 'Something went wrong. Please try again.';
}
