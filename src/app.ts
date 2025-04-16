// --- src/app.ts (ИНТЕГРИРОВАННЫЙ для Webhooks) ---
import express from "express"; // <-- Добавлен импорт Express
import http from "http"; // <-- Добавлен импорт http для graceful shutdown
import { bot } from "./bot"; // Импортируем инстанс бота
import { config } from "./config"; // Импортируем ОБНОВЛЕННУЮ конфигурацию
import { connectDB } from "./services/database.service";

// Новая функция для запуска с вебхуками
async function startAppWithWebhook() {
  console.log("Starting bot application with Webhook support...");

  try {
    // 1. Подключаемся к базе данных MongoDB
    await connectDB();
    console.log("Database connected successfully.");

    // 2. Создаем Express приложение
    const app = express();
    app.use(express.json()); // Middleware для парсинга JSON (может быть полезно для других роутов)

    // 3. Генерируем URL вебхука из конфига
    const webhookUrl = `${config.webhookDomain}${config.webhookPath}`;
    console.log(`Attempting to set webhook to: ${webhookUrl}`);

    // 4. Устанавливаем вебхук в Telegram API
    const webhookSetSuccess = await bot.telegram.setWebhook(webhookUrl);
    if (!webhookSetSuccess) {
      throw new Error(
        "Telegram API failed to set webhook. Check bot token and webhook URL."
      );
    }
    console.log(`Webhook successfully set to ${webhookUrl}`);

    // 5. Настраиваем Express роут для приема обновлений от Telegram
    // Путь должен ТОЧНО совпадать с config.webhookPath и location в Nginx
    app.use(bot.webhookCallback(config.webhookPath));

    // (Опционально) Корневой роут для проверки работы сервера
    app.get("/", (req, res) => {
      res.send("Bot application is running with webhooks!");
    });

    // (Опционально) Роут для проверки информации о вебхуке
    app.get("/webhookinfo", async (req, res) => {
      try {
        const info = await bot.telegram.getWebhookInfo();
        res.json(info);
      } catch (error) {
        console.error("Error fetching webhook info:", error);
        res.status(500).send("Error fetching webhook info");
      }
    });

    // 6. Запускаем Express сервер на порту из конфига
    const server = app.listen(config.port, () => {
      console.log(`✅ Bot server listening on port ${config.port}`);
      console.log(`Webhook endpoint path: ${config.webhookPath}`);
      // Попробуем получить имя бота после установки вебхука
      bot.telegram
        .getMe()
        .then((botInfo) => {
          console.log(`Bot username: @${botInfo.username}`);
        })
        .catch((err) => {
          console.error("Could not get bot info:", err);
        });
    });

    // 7. Настраиваем Graceful Shutdown
    const shutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        console.log("HTTP server closed.");
        try {
          await bot.telegram.deleteWebhook({ drop_pending_updates: true });
          console.log("Webhook deleted successfully.");
        } catch (error) {
          console.error("Error deleting webhook during shutdown:", error);
        }
        console.log("Bot shutdown complete.");
        process.exit(0);
      });

      // Принудительный выход через 10 секунд, если что-то зависло
      setTimeout(() => {
        console.error("Could not close connections in time, forcing shut down");
        process.exit(1);
      }, 10000);
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error(
      "❌ Failed to start the bot application with webhook:",
      error
    );
    process.exit(1); // Выход с кодом ошибки
  }
}

// Запускаем приложение с вебхуками
startAppWithWebhook();
