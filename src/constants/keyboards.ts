// --- src/constants/keyboards.ts ---
import { Markup } from "telegraf";
import { config } from "../config"; // Используем алиас @/ для путей от src/

// Фабрика для кнопки "Назад"
const backButton = (callback_data: string = "action_back") =>
  Markup.button.callback("⬅️ Назад", callback_data);
const mainMenuButton = () =>
  Markup.button.callback("🏠 В Главное меню", "action_main_menu");

export const keyboards = {
  // Главное меню
  mainMenu: Markup.inlineKeyboard([
    [
      Markup.button.callback(
        "🚗 Подобрать авто на сайте",
        "action_website_menu"
      ),
    ],
    [
      Markup.button.callback(
        "📝 Оставить заявку менеджеру",
        "action_leave_application"
      ),
    ],
    [
      Markup.button.callback(
        "🧮 Рассчитать выбранный автомобиль",
        "action_calculate_car"
      ),
    ],
    [Markup.button.url("✍️ Написать в Telegram", config.telegramContactUrl)],
    [Markup.button.url("📢 Перейти в наш канал", config.telegramChannelUrl)],
  ]),

  // Меню выбора сайта
  websiteMenu: Markup.inlineKeyboard([
    [Markup.button.url("🇰🇷 Авто из Южной Кореи", config.websiteUrls.korea)],
    [Markup.button.url("🇨🇳 Авто из Китая", config.websiteUrls.china)],
    [Markup.button.url("🇯🇵 Авто из Японии", config.websiteUrls.japan)],
    [backButton("action_main_menu")], // Назад в главное меню
  ]),

  // Кнопка "В главное меню"
  backToMainMenu: Markup.inlineKeyboard([[mainMenuButton()]]),

  // Общая кнопка "Назад" (для сцен)
  backOnly: (action: string = "action_back") =>
    Markup.inlineKeyboard([[backButton(action)]]),

  // Кнопка отмены сцены (возврат в главное меню)
  cancelScene: Markup.inlineKeyboard([
    [backButton("action_cancel_scene")], // Отмена и возврат в главное меню
  ]),

  // Заявка: подтверждение
  leaveApplicationConfirm: Markup.inlineKeyboard([
    [Markup.button.callback("✅ Отправить", "action_send_application")],
    [backButton()], // Назад к предыдущему шагу сцены
  ]),

  // Калькулятор: выбор страны
  calculatorCountry: Markup.inlineKeyboard([
    [Markup.button.callback("🇰🇷 Южная Корея", "calc_country_korea")],
    [Markup.button.callback("🇨🇳 Китай", "calc_country_china")],
    [Markup.button.callback("🇯🇵 Япония", "calc_country_japan")],
    [mainMenuButton()], // Сразу в главное меню
  ]),

  // --- ИЗМЕНЕННАЯ КЛАВИАТУРА (для Кореи/Китая) ---
  // Калькулятор: тип топлива (Стандартный)
  calculatorFuelType: Markup.inlineKeyboard([
    [Markup.button.callback("⛽ Бензин/Дизель", "calc_fuel_petrol_diesel")], // Изменено
    [Markup.button.callback("🌱 Гибрид", "calc_fuel_hybrid")], // Добавлено
    [Markup.button.callback("⚡ Электро", "calc_fuel_electric")],
    [backButton()], // Назад к предыдущему шагу
  ]),
  // --- КОНЕЦ ИЗМЕНЕНИЯ ---

  // --- НОВАЯ КЛАВИАТУРА (для Японии) ---
  calculatorFuelTypeJapan: Markup.inlineKeyboard([
    [Markup.button.callback("⛽ Бензин/Дизель", "calc_fuel_petrol_diesel")],
    [Markup.button.callback("🌱 Гибрид", "calc_fuel_hybrid")],
    [backButton()], // Назад к предыдущему шагу
  ]),
  // --- КОНЕЦ НОВОЙ КЛАВИАТУРЫ ---

  // Калькулятор: возраст авто
  calculatorCarAge: Markup.inlineKeyboard([
    [Markup.button.callback("👶 Моложе 3 лет", "calc_age_<3")],
    [Markup.button.callback("🧑 От 3 до 5 лет", "calc_age_3-5")],
    [Markup.button.callback("👴 Старше 5 лет", "calc_age_>5")],
    [backButton()], // Назад к предыдущему шагу
  ]),

  // Калькулятор: кнопки после результата
  calculatorResult: Markup.inlineKeyboard([
    [
      Markup.button.callback(
        "🔄 Рассчитать другой автомобиль",
        "action_calculate_car_again"
      ),
    ],
    [mainMenuButton()], // В главное меню
  ]),
};
