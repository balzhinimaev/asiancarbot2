// --- src/services/database.service.ts ---
import mongoose from "mongoose";
import { config } from "../config"; // Используем алиас @/

export const connectDB = async (): Promise<void> => {
  try {
    console.log("Attempting to connect to MongoDB...");
    await mongoose.connect(config.mongoUri, {
      dbName: "raschet",
      // Опции Mongoose 6+ устанавливаются по умолчанию, но можно указать явно
      // useNewUrlParser: true, // устарело
      // useUnifiedTopology: true, // устарело
      // useCreateIndex: true, // устарело
      // useFindAndModify: false, // устарело
    });
    console.log("✅ MongoDB Connected Successfully.");

    // Логируем события подключения (опционально)
    mongoose.connection.on("disconnected", () => {
      console.warn("MongoDB disconnected.");
    });
    mongoose.connection.on("reconnected", () => {
      console.info("MongoDB reconnected.");
    });
    mongoose.connection.on("error", (error) => {
      console.error("MongoDB connection error:", error);
    });
  } catch (err: any) {
    console.error(
      "❌ MongoDB connection error during initial connection:",
      err.message
    );
    // Критическая ошибка при первом подключении - выходим из приложения
    process.exit(1);
  }
};
