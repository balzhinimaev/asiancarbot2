// --- src/scenes/index.ts ---
import { Scenes, Context } from "telegraf";
import { leaveApplicationScene } from "./leaveApplication.scene";
import { calculateCarScene } from "./calculateCar.scene";

// Создаем Stage (менеджер сцен) и регистрируем наши сцены
// Обязательно передаем наш кастомный Context для корректной работы типов
export const stage = new Scenes.Stage<Context>([
  leaveApplicationScene,
  calculateCarScene,
  // Сюда можно добавлять другие сцены по мере необходимости
]);

// Экспортируем middleware для использования в bot.ts
export const scenesMiddleware = () => stage.middleware();
