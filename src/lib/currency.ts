export type CurrencyCode =
  | "EGP"
  | "USD"
  | "SAR"
  | "AED"
  | "EUR"
  | "GBP"
  | "KWD"
  | "QAR"
  | "BHD"
  | "OMR"
  | "JOD"
  | "LBP"
  | "TRY"
  | "INR"
  | "CNY"
  | "JPY";

export const SUPPORTED_CURRENCIES: CurrencyCode[] = [
  "EGP",
  "USD",
  "SAR",
  "AED",
  "EUR",
  "GBP",
  "KWD",
  "QAR",
  "BHD",
  "OMR",
  "JOD",
  "LBP",
  "TRY",
  "INR",
  "CNY",
  "JPY",
];

export const CURRENCY_INFO: Record<
  CurrencyCode,
  { symbol: string; name: string; locale: string; decimalDigits: number }
> = {
  EGP: { symbol: "EGP", name: "Egyptian Pound", locale: "ar-EG", decimalDigits: 2 },
  USD: { symbol: "$", name: "US Dollar", locale: "en-US", decimalDigits: 2 },
  SAR: { symbol: "SAR", name: "Saudi Riyal", locale: "ar-SA", decimalDigits: 2 },
  AED: { symbol: "AED", name: "UAE Dirham", locale: "ar-AE", decimalDigits: 2 },
  EUR: { symbol: "€", name: "Euro", locale: "de-DE", decimalDigits: 2 },
  GBP: { symbol: "£", name: "British Pound", locale: "en-GB", decimalDigits: 2 },
  KWD: { symbol: "KWD", name: "Kuwaiti Dinar", locale: "ar-KW", decimalDigits: 3 },
  QAR: { symbol: "QAR", name: "Qatari Riyal", locale: "ar-QA", decimalDigits: 2 },
  BHD: { symbol: "BHD", name: "Bahraini Dinar", locale: "ar-BH", decimalDigits: 3 },
  OMR: { symbol: "OMR", name: "Omani Rial", locale: "ar-OM", decimalDigits: 3 },
  JOD: { symbol: "JOD", name: "Jordanian Dinar", locale: "ar-JO", decimalDigits: 3 },
  LBP: { symbol: "LBP", name: "Lebanese Pound", locale: "ar-LB", decimalDigits: 0 },
  TRY: { symbol: "₺", name: "Turkish Lira", locale: "tr-TR", decimalDigits: 2 },
  INR: { symbol: "₹", name: "Indian Rupee", locale: "en-IN", decimalDigits: 2 },
  CNY: { symbol: "¥", name: "Chinese Yuan", locale: "zh-CN", decimalDigits: 2 },
  JPY: { symbol: "¥", name: "Japanese Yen", locale: "ja-JP", decimalDigits: 0 },
};

export const BASE_RATES: Record<CurrencyCode, number> = {
  EGP: 1,
  USD: 0.020,
  SAR: 0.075,
  AED: 0.073,
  EUR: 0.018,
  GBP: 0.016,
  KWD: 0.0061,
  QAR: 0.073,
  BHD: 0.0076,
  OMR: 0.0077,
  JOD: 0.014,
  LBP: 1800,
  TRY: 0.65,
  INR: 1.65,
  CNY: 0.14,
  JPY: 3.0,
};

// Exchange rates relative to USD (1 USD = X units of currency).
export const EXCHANGE_RATES: Record<string, number> = {
  USD: 1,
  EGP: 48.5,
  SAR: 3.75,
  AED: 3.67,
  EUR: 0.92,
  GBP: 0.79,
  KWD: 0.306,
  QAR: 3.64,
  BHD: 0.376,
  OMR: 0.385,
  JOD: 0.709,
  LBP: 89500,
  TRY: 34.2,
  INR: 83.5,
  CNY: 7.1,
  JPY: 149.5,
};

export function convertPrice(
  amount: number,
  fromCurrency: string = "EGP",
  toCurrency: string = "EGP"
): number {
  if (!Number.isFinite(amount)) return 0;

  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) return amount;

  const fromRate = EXCHANGE_RATES[from] || 1;
  const toRate = EXCHANGE_RATES[to] || 1;

  const baseInUSD = amount / fromRate;
  const converted = baseInUSD * toRate;

  return Math.round(converted * 100) / 100;
}

export function convertAndFormatPrice(
  amount: number,
  fromCurrency: string = "EGP",
  toCurrency: string = "EGP",
  locale?: string
): string {
  const converted = convertPrice(amount, fromCurrency, toCurrency);
  return formatCurrency(converted, toCurrency, locale);
}

const rateCache = new Map<string, { rate: number | Record<CurrencyCode, number>; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 6;

function getCachedRate(key: string): number | Record<CurrencyCode, number> | null {
  const cached = rateCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.rate;
  }
  return null;
}

function setCachedRate(key: string, rate: number | Record<CurrencyCode, number>): void {
  rateCache.set(key, { rate, timestamp: Date.now() });
}

export function formatCurrency(
  amount: number,
  currencyCode: string,
  locale?: string
): string {
  const currency = currencyCode.toUpperCase() as CurrencyCode;
  const info = CURRENCY_INFO[currency] ?? CURRENCY_INFO.USD;
  const formatLocale = locale ?? info.locale;

  try {
    return new Intl.NumberFormat(formatLocale, {
      style: "currency",
      currency,
      minimumFractionDigits: info.decimalDigits,
      maximumFractionDigits: info.decimalDigits,
    }).format(amount);
  } catch {
    const fallbackLocale = info.locale;
    return new Intl.NumberFormat(fallbackLocale, {
      style: "currency",
      currency,
      minimumFractionDigits: info.decimalDigits,
      maximumFractionDigits: info.decimalDigits,
    }).format(amount);
  }
}

export function formatCurrencyCompact(
  amount: number,
  currencyCode: string,
  locale?: string
): string {
  const currency = currencyCode.toUpperCase() as CurrencyCode;
  const info = CURRENCY_INFO[currency] ?? CURRENCY_INFO.USD;
  const formatLocale = locale ?? info.locale;

  try {
    return new Intl.NumberFormat(formatLocale, {
      style: "currency",
      currency,
      notation: "compact",
      compactDisplay: "short",
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return formatCurrency(amount, currencyCode, locale);
  }
}

export function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  customRates?: Record<string, number>
): number {
  const from = fromCurrency.toUpperCase() as CurrencyCode;
  const to = toCurrency.toUpperCase() as CurrencyCode;

  if (from === to) return amount;

  const rates = customRates ?? BASE_RATES;

  const fromRate = rates[from] ?? BASE_RATES[from] ?? 1;
  const toRate = rates[to] ?? BASE_RATES[to] ?? 1;

  if (fromRate === 0) return amount;

  const amountInBase = amount / fromRate;
  const convertedAmount = amountInBase * toRate;

  const toInfo = CURRENCY_INFO[to];
  const precision = toInfo?.decimalDigits ?? 2;
  const multiplier = Math.pow(10, precision);

  return Math.round(convertedAmount * multiplier) / multiplier;
}

export async function fetchLiveRates(
  baseCurrency: CurrencyCode = "USD"
): Promise<Record<CurrencyCode, number> | null> {
  const cacheKey = `live-rates-${baseCurrency}`;
  const cached = getCachedRate(cacheKey);
  if (cached) return cached as Record<CurrencyCode, number>;

  try {
    const response = await fetch(
      `https://api.exchangerate-api.com/v4/latest/${baseCurrency}`,
      { next: { revalidate: 3600 } }
    );
    if (!response.ok) throw new Error("Failed to fetch rates");

    const data = await response.json();
    const rates: Record<CurrencyCode, number> = {} as Record<CurrencyCode, number>;

    for (const currency of SUPPORTED_CURRENCIES) {
      if (data.rates[currency]) {
        rates[currency] = data.rates[currency];
      }
    }

    if (Object.keys(rates).length > 0) {
      setCachedRate(cacheKey, rates);
      return rates;
    }
  } catch (error) {
    console.warn("[currency] Failed to fetch live rates, using fallback:", error);
  }

  return null;
}

export function getCurrencyInfo(currencyCode: string) {
  return CURRENCY_INFO[currencyCode.toUpperCase() as CurrencyCode] ?? CURRENCY_INFO.USD;
}

export function getDefaultCurrencyForCountry(countryCode: string): CurrencyCode {
  const country = countryCode.toUpperCase();

  const countryCurrencyMap: Record<string, CurrencyCode> = {
    US: "USD",
    SA: "SAR",
    AE: "AED",
    EG: "EGP",
    GB: "GBP",
    KW: "KWD",
    QA: "QAR",
    BH: "BHD",
    OM: "OMR",
    JO: "JOD",
    LB: "LBP",
    TR: "TRY",
    IN: "INR",
    CN: "CNY",
    JP: "JPY",
    DE: "EUR",
    FR: "EUR",
    IT: "EUR",
    ES: "EUR",
    NL: "EUR",
    BE: "EUR",
    AT: "EUR",
    PT: "EUR",
    IE: "EUR",
    FI: "EUR",
    GR: "EUR",
  };

  if (countryCurrencyMap[country]) {
    return countryCurrencyMap[country];
  }

  const euCountries = [
    "DE",
    "FR",
    "IT",
    "ES",
    "NL",
    "BE",
    "AT",
    "PT",
    "IE",
    "FI",
    "GR",
    "LU",
    "SI",
    "SK",
    "LT",
    "LV",
    "EE",
    "MT",
    "CY",
    "HR",
  ];
  if (euCountries.includes(country)) {
    return "EUR";
  }

  return "USD";
}

export function validateCurrencyCode(code: string): code is CurrencyCode {
  return SUPPORTED_CURRENCIES.includes(code.toUpperCase() as CurrencyCode);
}

export function getSupportedCurrencies(): CurrencyCode[] {
  return [...SUPPORTED_CURRENCIES];
}