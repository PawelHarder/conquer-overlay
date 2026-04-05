/**
 * Market HTTP client — URL building and request execution.
 * Isolated here so main.js stays focused on window/IPC management.
 */

const MARKET_BASE_URL           = 'https://conqueronline.net';
const MARKET_REQUEST_TIMEOUT_MS = 10000;

function buildMarketUrl(requestPath, params = {}) {
  if (typeof requestPath !== 'string' || !requestPath.startsWith('/Community/')) {
    throw new Error('Invalid market path');
  }

  const url = new URL(requestPath, MARKET_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  return url;
}

async function requestMarket(requestPath, params = {}, responseType = 'json') {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MARKET_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(buildMarketUrl(requestPath, params), {
      headers: {
        Accept: responseType === 'text' ? 'application/json, text/plain, */*' : 'application/json',
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Market API error ${res.status}: ${requestPath}`);
    }

    return responseType === 'text'
      ? (await res.text()).trim()
      : await res.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Market API timeout: ${requestPath}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = { requestMarket };
