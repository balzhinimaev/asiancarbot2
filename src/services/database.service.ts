// --- src/services/database.service.ts (АДМИН-БОТ) ---
import mongoose from "mongoose";
// Импортируем конфигурацию АДМИН-БОТА, чтобы получить строку подключения к БД
// Убедитесь, что путь правильный (может быть '../config' или '@/config')
import { config } from "../config"; // Используем '@/config' для примера

/**
 * Функция для установления соединения с базой данных MongoDB.
 * Использует строку подключения из конфигурационного файла админ-бота.
 * Обрабатывает ошибки подключения и логирует статус.
 */
export const connectDB = async (): Promise<void> => {
  try {
    // Проверяем, есть ли уже активное соединение
    if (mongoose.connection.readyState >= 1) {
      console.log("[Admin Bot DB] MongoDB is already connected.");
      return;
    }

    console.log(
      `[Admin Bot DB] Attempting to connect to MongoDB at ${config.mongoUri}...`
    );

    // Устанавливаем соединение
    await mongoose.connect(config.mongoUri, {
      dbName: "raschet",
    });

    console.log("✅ [Admin Bot DB] MongoDB Connected Successfully.");

    // --- Настройка обработчиков событий соединения ---
    mongoose.connection.on("reconnected", () => {
      console.info("[Admin Bot DB] MongoDB reconnected.");
    });
    mongoose.connection.on("disconnected", () => {
      console.warn("[Admin Bot DB] MongoDB disconnected.");
    });
    mongoose.connection.on("error", (error) => {
      console.error(
        "[Admin Bot DB] MongoDB connection error after initial connect:",
        error
      );
    });
  } catch (err: any) {
    // Обработка ошибки при ПЕРВОМ подключении
    console.error(
      "❌ [Admin Bot DB] MongoDB initial connection error:",
      err.message
    );
    console.error(
      "   Ensure MongoDB is running and MONGO_URI in .env is correct."
    );
    process.exit(1); // Завершаем процесс админ-бота при ошибке подключения
  }
};

/**
 * Функция для корректного закрытия соединения с MongoDB.
 */
export const disconnectDB = async (): Promise<void> => {
  try {
    if (mongoose.connection.readyState !== 0) {
      console.log("[Admin Bot DB] Disconnecting from MongoDB...");
      await mongoose.disconnect();
      console.log("[Admin Bot DB] MongoDB disconnected.");
    }
  } catch (error) {
    console.error("[Admin Bot DB] Error disconnecting from MongoDB:", error);
  }
};
