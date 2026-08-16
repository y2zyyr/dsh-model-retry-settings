// src/locale.ts
// Plugin-owned locale dictionaries (zh-CN + en). Core locale files are never
// touched. Keys: title + description of the General-settings row.
export const LOCALE_NS = 'dsh-model-retry-settings';

export const zh = {
  'title': '模型请求最大重试次数',
  'description': '模型请求因可重试错误失败时，最多自动重新请求的次数。0 表示关闭自动重试。',
};
export const en = {
  'title': 'Maximum model request retries',
  'description': 'Maximum number of automatic retries after a retryable model request failure. Set to 0 to disable automatic retries.',
};
