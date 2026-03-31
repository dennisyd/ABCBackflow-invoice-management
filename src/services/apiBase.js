const normalizeBaseUrl = (value) => {
  if (!value) {
    return '/api';
  }

  return value.replace(/\/+$/, '');
};

export const API_BASE = normalizeBaseUrl(process.env.REACT_APP_API_URL || '/api');
export const API_TOKEN = process.env.REACT_APP_API_TOKEN || '';

export const buildApiUrl = (path) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
};

export const buildApiHeaders = (headers = {}) => {
  const nextHeaders = { ...headers };

  if (API_TOKEN) {
    nextHeaders['X-API-Token'] = API_TOKEN;
  }

  return nextHeaders;
};

export const apiFetch = (path, options = {}) => {
  const { headers = {}, ...rest } = options;

  return fetch(buildApiUrl(path), {
    ...rest,
    headers: buildApiHeaders(headers),
  });
};
