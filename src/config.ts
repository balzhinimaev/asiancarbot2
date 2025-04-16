// --- src/config.ts (ИНТЕГРИРОВАННЫЙ для Webhooks) ---
import dotenv from "dotenv";

// Загружаем переменные окружения из .env файла
dotenv.config();

// --- Новая функция для парсинга порта ---
function parsePort(portStr: string | undefined, defaultPort: number): number {
  if (portStr) {
    const parsed = parseInt(portStr, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
      return parsed;
    }
  }
  console.warn(
    `Invalid or missing PORT in .env, using default: ${defaultPort}`
  );
  return defaultPort;
}
// --- Конец новой функции ---

interface Config {
  // --- Существующие параметры ---
  botToken: string;
  mongoUri: string;
  adminChatId: string | number;
  websiteUrls: {
    korea: string;
    china: string;
    japan: string;
  };
  telegramContactUrl: string;
  telegramChannelUrl: string;
  mockRates: {
    KRW: number;
    CNY: number;
    JPY: number;
    EUR: number;
  };

  // --- Новые параметры для Webhook ---
  port: number; // Локальный порт для Express этого бота
  webhookDomain: string; // Публичный домен (например, https://asiancar25.ru)
  webhookPath: string; // УНИКАЛЬНЫЙ путь для вебхука ЭТОГО бота
}

export const config: Config = {
  // --- Существующие ---
  botToken: process.env.BOT_TOKEN || "",
  mongoUri: process.env.MONGO_URI || "",
  adminChatId: process.env.ADMIN_CHAT_ID
    ? parseInt(process.env.ADMIN_CHAT_ID, 10) || process.env.ADMIN_CHAT_ID
    : "",
  websiteUrls: {
    korea: process.env.WEBSITE_URL_KOREA || "https://example.com/korea",
    china: process.env.WEBSITE_URL_CHINA || "https://example.com/china",
    japan: process.env.WEBSITE_URL_JAPAN || "https://example.com/japan",
  },
  telegramContactUrl:
    process.env.TELEGRAM_CONTACT_URL || "https://t.me/telegram",
  telegramChannelUrl:
    process.env.TELEGRAM_CHANNEL_URL || "https://t.me/telegram",
  mockRates: {
    KRW: parseFloat(process.env.MOCK_RATE_KRW || "0.07"),
    CNY: parseFloat(process.env.MOCK_RATE_CNY || "12.5"),
    JPY: parseFloat(process.env.MOCK_RATE_JPY || "0.60"),
    EUR: parseFloat(process.env.MOCK_RATE_EUR || "95.0"),
  },

  // --- Новые для Webhook ---
  port: parsePort(process.env.PORT, 5001), // Используем порт 5001 по умолчанию для этого бота
  webhookDomain: process.env.WEBHOOK_DOMAIN || "", // Домен должен быть с https://
  webhookPath: process.env.WEBHOOK_PATH || "", // Путь должен начинаться с /
};

// --- Проверка обязательных переменных ---
if (!config.botToken) {
  console.error("FATAL ERROR: BOT_TOKEN is not defined in the .env file.");
  process.exit(1);
}
if (!config.mongoUri) {
  console.error("FATAL ERROR: MONGO_URI is not defined in the .env file.");
  process.exit(1);
}
if (!config.adminChatId) {
  console.warn(
    "WARNING: ADMIN_CHAT_ID is not defined. Applications might not be forwarded."
  );
}

// --- Новые проверки для Webhook ---
if (!config.webhookDomain || !config.webhookDomain.startsWith("https://")) {
  console.error(
    "FATAL ERROR: WEBHOOK_DOMAIN is not defined or invalid (must start with https://) in .env file!"
  );
  process.exit(1);
}
if (!config.webhookPath || !config.webhookPath.startsWith("/")) {
  console.error(
    "FATAL ERROR: WEBHOOK_PATH is not defined or invalid (must start with /) in .env file!"
  );
  process.exit(1);
}

// --- Логирование настроек Webhook ---
console.log(
  `Webhook URL will be set to: ${config.webhookDomain}${config.webhookPath}`
);
console.log(`Express server will listen on port: ${config.port}`);
// --- Конец логирования ---
