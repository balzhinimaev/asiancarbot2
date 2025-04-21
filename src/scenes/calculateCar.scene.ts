// --- src/scenes/calculateCar.scene.ts ---
import { Scenes, Markup, Context, TelegramError } from "telegraf";
import { message } from "telegraf/filters";
import { messages } from "../constants/messages";
// Импортируем ОБНОВЛЕННЫЕ клавиатуры
import { keyboards } from "../constants/keyboards";
import { SCENE_IDS } from "../constants/scenes";
// Импортируем ОБНОВЛЕННЫЙ тип сессии
import { CalculateCarWizardSession } from "../types/telegraf";
// Импортируем ОБНОВЛЕННЫЙ сервис и результат
import {
  calculateCarCost,
  CalculationResult,
} from "../services/calculation.service";

// --- Функция форматирования (без изменений) ---
const formatRub = (value: number): string => {
  return value.toLocaleString("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  });
};

// --- Вспомогательные функции для шагов сцены (С ИЗМЕНЕНИЯМИ) ---
const stepHandlers = {
  // Шаг 0: Запрос страны (без изменений)
  askCountry: async (ctx: Context) => {
    console.log("[DEBUG askCountry] Entered step 0.");
    try {
      if (ctx.session?.__processing_recalculate) {
        console.log("[DEBUG askCountry] Resetting recalculate lock (safety).");
        delete ctx.session.__processing_recalculate;
      }
      await ctx.reply(
        messages.selectCalculationCountry,
        keyboards.calculatorCountry // Клавиатура выбора страны
      );
      if (ctx.wizard) {
        return ctx.wizard.next(); // Переход к шагу 1
      } else {
        throw new Error("Wizard context lost in askCountry");
      }
    } catch (error) {
      console.error("[DEBUG askCountry] Error:", error);
      await ctx.reply(messages.error + " Ошибка при запуске калькулятора.");
      if (ctx.scene) return ctx.scene.leave();
    }
  },

  // Шаг 1: Обработка страны, запрос стоимости (без изменений)
  handleCountryAndAskCost: async (ctx: Context) => {
    console.log("[DEBUG handleCountryAndAskCost] Entered step 1.");
    if (
      ctx.updateType !== "callback_query" ||
      !ctx.callbackQuery ||
      !("data" in ctx.callbackQuery) ||
      !ctx.callbackQuery.data.startsWith("calc_country_")
    ) {
      console.log("[DEBUG] Ignoring update, not country callback.");
      return;
    }
    await ctx.answerCbQuery();
    const country = ctx.callbackQuery.data.split("_")[2] as
      | "korea"
      | "china"
      | "japan";

    if (!ctx.wizard) {
      console.error("[DEBUG] ctx.wizard is undefined!");
      await ctx.reply(messages.error + " Ошибка состояния сцены (wizard).");
      if (ctx.scene) return ctx.scene.leave();
      else return;
    }
    if (!ctx.wizard.state) {
      console.error("[DEBUG] ctx.wizard.state is undefined!");
      await ctx.reply(messages.error + " Ошибка состояния сцены (state).");
      if (ctx.scene) return ctx.scene.leave();
      else return;
    }

    const session = ctx.wizard.state as CalculateCarWizardSession;
    session.country = country;
    if (country === "korea") session.currency = "KRW";
    else if (country === "china") session.currency = "CNY";
    else if (country === "japan") session.currency = "JPY";
    console.log("[DEBUG] Session state after country:", session);

    if (session.currency) {
      try {
        if (
          ctx.callbackQuery.message &&
          ("text" in ctx.callbackQuery.message ||
            "caption" in ctx.callbackQuery.message)
        ) {
          await ctx.editMessageReplyMarkup(undefined);
        }
      } catch (e) {
        /* Игнорируем ошибки редактирования */ console.warn(
          "Could not edit markup when handling country:",
          e
        );
      }

      try {
        await ctx.reply(
          messages.enterCarCost(session.currency), // Запрос стоимости
          keyboards.backOnly("action_back_to_country") // Кнопка назад к выбору страны
        );
        console.log("[DEBUG] Asked cost. Selecting step 2 explicitly...");
        ctx.wizard.selectStep(2); // Явно устанавливаем шаг 2 (ожидание стоимости)
        console.log("[DEBUG] Step 2 selected.");
        return;
      } catch (error) {
        /* Обработка ошибки */ console.error(error);
        await ctx.reply(messages.error);
        if (ctx.scene) return ctx.scene.leave();
      }
    } else {
      /* Ошибка валюты */ console.error("FATAL: Could not determine currency");
      await ctx.reply(messages.error);
      if (ctx.scene) return ctx.scene.leave();
    }
  },

  // Шаг 2: Обработка стоимости, ЗАПРОС ТИПА ТОПЛИВА (ИЗМЕНЕНО)
  handleCostAndAskFuel: async (ctx: Context) => {
    console.log("[DEBUG handleCostAndAskFuel] Entered step 2.");
    if (!ctx.wizard || !ctx.wizard.state) {
      /* проверка wizard/state */ console.error("[DEBUG] Missing wizard/state");
      await ctx.reply(messages.error);
      if (ctx.scene) return ctx.scene.leave();
      else return;
    }
    if (!ctx.has(message("text")) || !ctx.message.text?.trim()) {
      /* проверка текста */ console.log("[DEBUG] Ignoring update, not text.");
      return;
    }

    const costInput = ctx.message.text
      .trim()
      .replace(/\s/g, "")
      .replace(",", ".");
    const cost = parseFloat(costInput);
    console.log(`[DEBUG] Parsed cost: ${cost}`);

    const session = ctx.wizard.state as CalculateCarWizardSession; // Получаем сессию ЗДЕСЬ

    if (isNaN(cost) || cost <= 0) {
      // Валидация стоимости
      console.log(`[DEBUG] Invalid cost value: ${cost}`);
      await ctx.reply(messages.invalidNumber);
      if (!session.currency) {
        /* проверка валюты */ console.error(
          "[DEBUG] Session currency missing!"
        );
        await ctx.reply(messages.error);
        if (ctx.scene) return ctx.scene.leave();
        else return;
      }
      await ctx.reply(messages.enterCarCost(session.currency)); // Повторный запрос
      return; // Остаемся на шаге 2
    }

    console.log(`[DEBUG] Cost ${cost} is valid. Saving...`);
    session.cost = cost; // Сохраняем стоимость в сессию
    console.log("[DEBUG] Session state after cost:", JSON.stringify(session));

    // <<< НАЧАЛО ИЗМЕНЕНИЙ: Выбор клавиатуры в зависимости от страны >>>
    let fuelKeyboard = keyboards.calculatorFuelType; // Клавиатура по умолчанию
    if (session.country === "japan") {
      console.log(
        "[DEBUG] Country is Japan, using Japan-specific fuel keyboard."
      );
      fuelKeyboard = keyboards.calculatorFuelTypeJapan; // Клавиатура для Японии (без электро)
    } else {
      console.log(
        "[DEBUG] Country is not Japan, using standard fuel keyboard."
      );
    }
    // <<< КОНЕЦ ИЗМЕНЕНИЙ >>>

    try {
      // Отправляем сообщение с ВЫБРАННОЙ клавиатурой
      await ctx.reply(messages.selectFuelType, fuelKeyboard);
      console.log("[DEBUG] Asked fuel type. Moving to step 3...");
      // return ctx.wizard.next(); // Переход к шагу 3 (ожидание типа топлива)
      ctx.wizard.selectStep(3); // Явно указываем шаг 3
      return;
    } catch (replyError) {
      /* Обработка ошибки */ console.error(replyError);
      await ctx.reply(messages.error);
      if (ctx.scene) return ctx.scene.leave();
    }
  },

  // Шаг 3: ОБРАБОТКА ТИПА ТОПЛИВА, запрос V/P (ИЗМЕНЕНО)
  handleFuelAndAskVolumeOrPower: async (ctx: Context) => {
    console.log("[DEBUG handleFuelAndAskVolumeOrPower] Entered step 3.");
    if (!ctx.wizard || !ctx.wizard.state) {
      /* проверка wizard/state */ console.error("[DEBUG] Missing wizard/state");
      await ctx.reply(messages.error);
      if (ctx.scene) return ctx.scene.leave();
      else return;
    }

    if (
      // Проверка, что это callback с нужным префиксом
      ctx.updateType !== "callback_query" ||
      !ctx.callbackQuery ||
      !("data" in ctx.callbackQuery) ||
      !ctx.callbackQuery.data.startsWith("calc_fuel_")
    ) {
      console.log("[DEBUG] Ignoring update, not fuel callback.");
      // Можно повторно отправить кнопки, если пришло что-то не то
      const sessionPrev = ctx.wizard.state as CalculateCarWizardSession;
      let fuelKeyboardPrev = keyboards.calculatorFuelType;
      if (sessionPrev.country === "japan") {
        fuelKeyboardPrev = keyboards.calculatorFuelTypeJapan;
      }
      await ctx.reply(messages.pleaseUseButtons);
      await ctx.reply(messages.selectFuelType, fuelKeyboardPrev);
      return;
    }

    await ctx.answerCbQuery();
    const fuelChoice = ctx.callbackQuery.data; // e.g., "calc_fuel_petrol_diesel"
    const session = ctx.wizard.state as CalculateCarWizardSession;

    // <<< НАЧАЛО ИЗМЕНЕНИЙ: Обработка выбора и сохранение fuelType >>>
    let selectedFuelType: "petrol_diesel" | "hybrid" | "electric" | null = null;

    if (fuelChoice === "calc_fuel_petrol_diesel") {
      selectedFuelType = "petrol_diesel";
    } else if (fuelChoice === "calc_fuel_hybrid") {
      selectedFuelType = "hybrid";
    } else if (fuelChoice === "calc_fuel_electric") {
      selectedFuelType = "electric";
    }

    // Проверка: Запрет электро для Японии
    if (session.country === "japan" && selectedFuelType === "electric") {
      console.warn("[DEBUG] Attempted to select electric for Japan. Denying.");
      try {
        // Попытка отредактировать сообщение с предупреждением
        if (
          ctx.callbackQuery.message &&
          ("text" in ctx.callbackQuery.message ||
            "caption" in ctx.callbackQuery.message)
        ) {
          await ctx.editMessageText(
            "Извините, расчет электромобилей из Японии не поддерживается.\n" +
              messages.selectFuelType,
            keyboards.calculatorFuelTypeJapan // Показываем снова кнопки для Японии
          );
        } else {
          await ctx.reply(
            "Извините, расчет электромобилей из Японии не поддерживается."
          );
          await ctx.reply(
            messages.selectFuelType,
            keyboards.calculatorFuelTypeJapan
          );
        }
      } catch (editError) {
        console.error(
          "Error editing message on Japan electric denial:",
          editError
        );
        await ctx.reply(
          "Извините, расчет электромобилей из Японии не поддерживается."
        );
        await ctx.reply(
          messages.selectFuelType,
          keyboards.calculatorFuelTypeJapan
        );
      }
      return; // Остаемся на шаге 3
    }

    if (!selectedFuelType) {
      console.error(`[DEBUG] Invalid fuel choice callback data: ${fuelChoice}`);
      await ctx.reply("Некорректный выбор типа топлива. Попробуйте снова.");
      // Повторно показать кнопки
      let fuelKeyboardRetry = keyboards.calculatorFuelType;
      if (session.country === "japan")
        fuelKeyboardRetry = keyboards.calculatorFuelTypeJapan;
      await ctx.reply(messages.selectFuelType, fuelKeyboardRetry);
      return; // Остаемся на шаге 3
    }

    session.fuelType = selectedFuelType; // Сохраняем корректный тип
    console.log("[DEBUG] Session state after fuel type:", session);
    // <<< КОНЕЦ ИЗМЕНЕНИЙ >>>

    try {
      // Убираем кнопки после выбора
      if (
        ctx.callbackQuery.message &&
        ("text" in ctx.callbackQuery.message ||
          "caption" in ctx.callbackQuery.message)
      ) {
        await ctx.editMessageReplyMarkup(undefined);
      }
    } catch (e) {
      console.warn("Could not edit markup when handling fuel type:", e);
    }

    try {
      // Запрос следующего шага
      if (session.fuelType === "electric") {
        await ctx.reply(messages.enterEnginePower, keyboards.backOnly()); // Запрос мощности
      } else {
        // petrol_diesel или hybrid
        await ctx.reply(messages.enterEngineVolume, keyboards.backOnly()); // Запрос объема
      }
      console.log("[DEBUG] Asked V/P. Moving to step 4...");
      // return ctx.wizard.next(); // Переход к шагу 4 (ожидание V/P)
      ctx.wizard.selectStep(4); // Явно указываем шаг 4
      return;
    } catch (error) {
      /* Обработка ошибки */ console.error(error);
      await ctx.reply(messages.error);
      if (ctx.scene) return ctx.scene.leave();
    }
  },

  // Шаг 4: Обработка V/P, запрос возраста (без изменений в логике, но зависит от fuelType из шага 3)
  handleVolumeOrPowerAndAskAge: async (ctx: Context) => {
    console.log("[DEBUG handleVolumeOrPowerAndAskAge] Entered step 4.");
    if (!ctx.wizard || !ctx.wizard.state) {
      /* проверка wizard/state */ console.error("[DEBUG] Missing wizard/state");
      await ctx.reply(messages.error);
      if (ctx.scene) return ctx.scene.leave();
      else return;
    }
    if (!ctx.has(message("text")) || !ctx.message.text?.trim()) {
      /* проверка текста */ console.log("[DEBUG] Ignoring update, not text.");
      return;
    }

    const valueInput = ctx.message.text
      .trim()
      .replace(/\s/g, "")
      .replace(",", ".");
    const value = parseInt(valueInput, 10);
    console.log(`[DEBUG] Parsed value: ${value}`);
    const session = ctx.wizard.state as CalculateCarWizardSession; // Получаем сессию ЗДЕСЬ

    if (isNaN(value) || value <= 0) {
      // Валидация
      console.log(`[DEBUG] Invalid value: ${value}`);
      await ctx.reply(messages.invalidNumber);
      // Повторный запрос в зависимости от типа топлива
      if (!session.fuelType) {
        /* проверка */ console.error("[DEBUG] Missing fuelType!");
        await ctx.reply(messages.error);
        if (ctx.scene) return ctx.scene.leave();
        else return;
      }
      if (session.fuelType === "electric")
        await ctx.reply(messages.enterEnginePower);
      else await ctx.reply(messages.enterEngineVolume);
      return; // Остаемся на шаге 4
    }

    // Сохраняем значение в правильное поле
    if (session.fuelType === "electric") session.enginePower = value;
    else session.engineVolume = value; // Для petrol_diesel и hybrid
    console.log("[DEBUG] Session state after V/P:", session);

    try {
      await ctx.reply(messages.selectCarAge, keyboards.calculatorCarAge); // Запрос возраста
      console.log("[DEBUG] Asked age. Moving to step 5...");
      // return ctx.wizard.next(); // Переход к шагу 5 (ожидание возраста)
      ctx.wizard.selectStep(5); // Явно указываем шаг 5
      return;
    } catch (error) {
      /* Обработка ошибки */ console.error(error);
      await ctx.reply(messages.error);
      if (ctx.scene) return ctx.scene.leave();
    }
  },

  // Шаг 5: Обработка возраста, РАСЧЕТ и показ результата (ИЗМЕНЕНО - передача fuelType)
  handleAgeAndCalculate: async (ctx: Context) => {
    console.log("[DEBUG handleAgeAndCalculate] Entered step 5.");
    if (!ctx.wizard || !ctx.wizard.state) {
      /* проверка wizard/state */ console.error("[DEBUG] Missing wizard/state");
      await ctx.reply(messages.error);
      if (ctx.scene) return ctx.scene.leave();
      else return;
    }

    if (
      // Проверка, что это callback возраста
      ctx.updateType !== "callback_query" ||
      !ctx.callbackQuery ||
      !("data" in ctx.callbackQuery) ||
      !ctx.callbackQuery.data.startsWith("calc_age_")
    ) {
      console.log("[DEBUG] Ignoring update, not age callback.");
      await ctx.reply(messages.pleaseUseButtons);
      await ctx.reply(messages.selectCarAge, keyboards.calculatorCarAge);
      return;
    }

    await ctx.answerCbQuery();
    const age = ctx.callbackQuery.data.split("_")[2] as "<3" | "3-5" | ">5";
    const session = ctx.wizard.state as CalculateCarWizardSession;
    session.carAge = age; // Сохраняем возраст
    console.log("[DEBUG] Session state before calculation:", session);

    try {
      // Убираем кнопки возраста
      if (
        ctx.callbackQuery.message &&
        ("text" in ctx.callbackQuery.message ||
          "caption" in ctx.callbackQuery.message)
      ) {
        await ctx.editMessageReplyMarkup(undefined);
      }
    } catch (e) {
      console.warn("Could not edit markup when handling age:", e);
    }

    await ctx.reply(messages.calculating); // Сообщение о расчете

    try {
      // Проверка полноты данных ПЕРЕД вызовом сервиса
      if (
        !session.country ||
        typeof session.cost !== "number" ||
        !session.fuelType || // Проверяем наличие fuelType
        !session.carAge ||
        (session.fuelType === "electric" &&
          typeof session.enginePower !== "number") ||
        ((session.fuelType === "petrol_diesel" ||
          session.fuelType === "hybrid") &&
          typeof session.engineVolume !== "number") // <<< ИЗМЕНЕНО
      ) {
        console.error(
          "FATAL: Incomplete session data before calculation:",
          JSON.stringify(session)
        );
        await ctx.reply(messages.calculationErrorData);
        if (ctx.scene) return ctx.scene.leave();
        else return;
      }

      console.log("[DEBUG] Calling calculation service with params:", {
        country: session.country,
        cost: session.cost,
        fuelType: session.fuelType, // <<< Передаем обновленный fuelType
        carAge: session.carAge,
        enginePower: session.enginePower, // Будет undefined если не электро
        engineVolume: session.engineVolume, // Будет undefined если электро
      });

      // Вызов сервиса калькуляции
      const result: CalculationResult = await calculateCarCost({
        country: session.country,
        cost: session.cost,
        fuelType: session.fuelType, // <<< Передаем обновленный fuelType
        carAge: session.carAge,
        enginePower: session.enginePower,
        engineVolume: session.engineVolume,
      });

      console.log(
        "[DEBUG] Calculation finished. Result details (for log):",
        result.details
      );

      // Формирование сообщения с результатом (логика без изменений)
      const outputLines: string[] = [];
      outputLines.push(
        `- Стоимость авто (${result.costInOriginalCurrency.toLocaleString(
          "ru-RU"
        )} ${result.originalCurrency}): ${formatRub(result.costInRub)}`
      );
      const deliveryDestination =
        result.country === "china" ? "Уссурийска" : "Владивостока";
      outputLines.push(
        `- Доставка до ${deliveryDestination}: ${formatRub(
          result.deliveryCost
        )}`
      );
      outputLines.push(
        `- Услуги оформления/брокера: ${formatRub(result.оформленияSbktsepts)}`
      ); // Использует обновленную стоимость из сервиса
      outputLines.push(
        `- Таможенный платеж: ${formatRub(result.totalCustomsPayment)}`
      );
      outputLines.push(`- Таможенные сборы: ${formatRub(result.customsFees)}`);
      outputLines.push(
        `- Утилизационный сбор: ${formatRub(result.utilizationFee)}`
      );
      outputLines.push(
        `- Комиссия компании: ${formatRub(result.companyCommission)}`
      );

      const resultMessage =
        `${messages.calculationResultTitle}\n\n` +
        `${outputLines.join("\n")}\n` +
        `${messages.calculationResultFooter(result.totalCost)}\n` + // Добавил \n для отступа дисклеймера
        `${messages.calculationResultDisclaimer}`;

      await ctx.replyWithHTML(resultMessage, keyboards.calculatorResult); // Отправка результата с кнопками
      console.log("[DEBUG] Result sent. Moving to step 6...");
    } catch (error: any) {
      // Обработка ошибок расчета
      console.error(
        "Error during calculation service call or result sending:",
        error
      );
      await ctx.reply(messages.calculationErrorGeneric(error?.message)); // Показываем сообщение об ошибке
      // Можно добавить кнопки для повтора или выхода
      await ctx.reply("Что вы хотите сделать?", keyboards.calculatorResult); // Показываем кнопки после ошибки
      // Не выходим из сцены, остаемся на шаге 5, чтобы можно было нажать кнопки
      ctx.wizard.selectStep(6); // Явно переводим на шаг ожидания кнопок
      return;
    }
    // Переходим к шагу 6 (ожидание кнопок после результата)
    // return ctx.wizard.next();
    ctx.wizard.selectStep(6); // Явно указываем шаг 6
    return;
  },

  // Шаг 6: Ожидание действия после результата (без изменений)
  waitForAfterResultAction: async (ctx: Context) => {
    console.log(
      "[DEBUG waitForAfterResultAction] Entered step 6. Waiting for action..."
    );
    // Ничего не делаем, просто ждем callback_query от кнопок (или команды)
    return; // Остаемся на шаге 6
  },
};

// --- Создание WizardScene с обновленными хендлерами ---
export const calculateCarScene = new Scenes.WizardScene<Context>(
  SCENE_IDS.CALCULATE_CAR,
  stepHandlers.askCountry, // step 0
  stepHandlers.handleCountryAndAskCost, // step 1
  stepHandlers.handleCostAndAskFuel, // step 2 (изменен)
  stepHandlers.handleFuelAndAskVolumeOrPower, // step 3 (изменен)
  stepHandlers.handleVolumeOrPowerAndAskAge, // step 4
  stepHandlers.handleAgeAndCalculate, // step 5 (изменен)
  stepHandlers.waitForAfterResultAction // step 6
);

// --- Обработчики действий и команд внутри сцены (С ИЗМЕНЕНИЯМИ) ---

// Обработка кнопки "Назад" (action_back) - ОБНОВЛЕНО
calculateCarScene.action("action_back", async (ctx) => {
  if (!ctx.callbackQuery || !ctx.wizard || !ctx.wizard.state) {
    /* проверка контекста */ console.error(
      "[DEBUG action_back] Missing context"
    );
    await ctx.answerCbQuery("Ошибка");
    return;
  }
  await ctx.answerCbQuery();
  const currentStep = ctx.wizard.cursor;
  const session = ctx.wizard.state as CalculateCarWizardSession;
  console.log(`[DEBUG action_back] Triggered at step: ${currentStep}`);

  let targetStep: number;
  let replyMessage: string;
  let replyKeyboard: any; // Используем any, так как клавиатуры разные

  try {
    // Обернем в try-catch для обработки ошибок редактирования/отправки
    switch (currentStep) {
      // Назад с шага 2 (ввод стоимости) -> к шагу 0 (выбор страны)
      case 2:
        targetStep = 0;
        replyMessage = messages.selectCalculationCountry;
        replyKeyboard = keyboards.calculatorCountry;
        break;
      // Назад с шага 3 (выбор топлива) -> к шагу 2 (ввод стоимости)
      case 3:
        targetStep = 2;
        if (!session.currency) {
          throw new Error("Session currency missing on back from step 3");
        }
        replyMessage = messages.enterCarCost(session.currency);
        replyKeyboard = keyboards.backOnly("action_back_to_country"); // Назад к выбору страны
        break;
      // Назад с шага 4 (ввод V/P) -> к шагу 3 (выбор топлива) - <<< ИЗМЕНЕНО ЗДЕСЬ >>>
      case 4:
        targetStep = 3;
        replyMessage = messages.selectFuelType;
        // Выбираем правильную клавиатуру
        if (session.country === "japan") {
          replyKeyboard = keyboards.calculatorFuelTypeJapan;
        } else {
          replyKeyboard = keyboards.calculatorFuelType;
        }
        break;
      // Назад с шага 5 (выбор возраста) -> к шагу 4 (ввод V/P)
      case 5:
        targetStep = 4;
        if (!session.fuelType) {
          throw new Error("Session fuelType missing on back from step 5");
        }
        replyMessage =
          session.fuelType === "electric"
            ? messages.enterEnginePower
            : messages.enterEngineVolume;
        replyKeyboard = keyboards.backOnly(); // Назад к выбору топлива
        break;
      // Назад с шага 6 (после результата) -> к шагу 5 (выбор возраста)
      case 6:
        targetStep = 5;
        replyMessage = messages.selectCarAge;
        replyKeyboard = keyboards.calculatorCarAge;
        break;
      default:
        console.warn(
          `[DEBUG action_back] Back action ignored on step ${currentStep}`
        );
        await ctx.reply("Не могу вернуться назад с этого шага.");
        return;
    }

    console.log(
      `[DEBUG action_back] Attempting to edit message to step ${targetStep}'s view`
    );
    // Пытаемся отредактировать предыдущее сообщение
    if (
      ctx.callbackQuery.message &&
      ("text" in ctx.callbackQuery.message ||
        "caption" in ctx.callbackQuery.message)
    ) {
      try {
        await ctx.editMessageText(replyMessage, replyKeyboard);
      } catch (e: any) {
        if (
          e instanceof TelegramError &&
          e.response?.description?.includes("message is not modified")
        ) {
          console.warn(
            `[DEBUG action_back] Message not modified, proceeding to step selection.`
          );
        } else {
          console.error(
            "[DEBUG action_back] Error editing message, sending new one:",
            e
          );
          await ctx.reply(replyMessage, replyKeyboard); // Отправляем новое, если редактирование не удалось
        }
      }
    } else {
      // Если редактирование невозможно, отправляем новое
      console.warn("[DEBUG action_back] Cannot edit message, sending new one.");
      await ctx.reply(replyMessage, replyKeyboard);
    }

    console.log(`[DEBUG action_back] Selecting step ${targetStep}`);
    ctx.wizard.selectStep(targetStep); // Устанавливаем нужный шаг
  } catch (error) {
    // Обработка общих ошибок при возврате
    console.error("[DEBUG action_back] Error processing back action:", error);
    await ctx.reply(messages.error + " Не удалось вернуться назад.");
    // Можно попробовать выйти из сцены в случае серьезной ошибки
    // if (ctx.scene) return ctx.scene.leave();
  }
});

// Назад к выбору страны (с шага ввода стоимости)
calculateCarScene.action("action_back_to_country", async (ctx) => {
  if (!ctx.callbackQuery || !ctx.wizard) {
    /* проверка */ await ctx.answerCbQuery("Ошибка");
    return;
  }
  console.log("[DEBUG action_back_to_country] Triggered.");
  await ctx.answerCbQuery();
  try {
    if (
      ctx.callbackQuery.message &&
      ("text" in ctx.callbackQuery.message ||
        "caption" in ctx.callbackQuery.message)
    ) {
      await ctx.editMessageText(
        messages.selectCalculationCountry,
        keyboards.calculatorCountry
      );
    } else {
      await ctx.reply(
        messages.selectCalculationCountry,
        keyboards.calculatorCountry
      );
    }
    ctx.wizard.selectStep(1); // Возврат к обработке выбора страны
  } catch (error) {
    console.error("[DEBUG action_back_to_country] Error:", error);
    await ctx.reply(messages.error);
  }
});

// --- ОБРАБОТЧИК action_calculate_car_again (С КОРРЕКТИРОВКОЙ) ---
calculateCarScene.action("action_calculate_car_again", async (ctx) => {
  console.log("[DEBUG action_calculate_car_again] Triggered.");

  if (!ctx.scene || !ctx.callbackQuery || !ctx.session || !ctx.wizard) {
    console.error("[DEBUG] Missing context for recalculate.");
    try {
      if (ctx.callbackQuery) await ctx.answerCbQuery("Ошибка контекста");
    } catch (e) {
      /*ignore*/
    }
    return;
  }

  // Простая блокировка от двойного нажатия
  if (ctx.session.__processing_recalculate) {
    console.warn("[DEBUG] Recalculate action already processing.");
    try {
      await ctx.answerCbQuery("Обработка...");
    } catch (e) {
      /*ignore*/
    }
    return;
  }
  ctx.session.__processing_recalculate = true;
  console.log("[DEBUG] Processing lock SET for recalculate.");

  try {
    await ctx.answerCbQuery(); // Отвечаем на нажатие

    // 1. Убираем кнопки у сообщения с результатами
    try {
      if (
        ctx.callbackQuery.message &&
        ("text" in ctx.callbackQuery.message ||
          "caption" in ctx.callbackQuery.message) &&
        ctx.callbackQuery.message.reply_markup
      ) {
        console.log("[DEBUG] Attempting to remove result markup...");
        await ctx.editMessageReplyMarkup(undefined);
        console.log("[DEBUG] Result markup removed.");
      } else {
        console.log("[DEBUG] No result markup to remove or cannot edit.");
      }
    } catch (e: any) {
      /* Обработка ошибки 'not modified' и других */
      if (
        e instanceof TelegramError &&
        e.response?.description?.includes("message is not modified")
      ) {
        console.warn("Could not remove markup (not modified).");
      } else {
        console.error("Error removing markup on recalculate:", e);
      }
    }

    // 2. Отправляем сообщение о начале нового расчета
    await ctx.reply("Хорошо, давайте рассчитаем другой автомобиль.");

    // 3. Очищаем состояние волшебника (данные предыдущего расчета)
    console.log("[DEBUG] Clearing wizard state for recalculate.");
    // ctx.wizard.state = {}; // <<< ВАЖНО: Сброс данных формы

    // 4. Переходим к самому первому шагу (запрос страны)
    console.log("[DEBUG] Selecting step 0 for recalculate.");
    await stepHandlers.askCountry(ctx); // Вызываем хендлер первого шага
    // ctx.wizard.selectStep(0); // Установка шага 0 (askCountry сам перейдет на 1)
  } catch (error) {
    console.error("[DEBUG] Error during recalculate process:", error);
    try {
      await ctx.reply(messages.error + " Ошибка при перезапуске расчета.");
    } catch (e) {
      /*ignore*/
    }
  } finally {
    // 5. Гарантированно сбрасываем флаг блокировки
    console.log("[DEBUG] Releasing processing lock for recalculate.");
    delete ctx.session.__processing_recalculate;
  }
  return; // Завершаем обработку
});
// --- КОНЕЦ ОБРАБОТЧИКА ---

// Вернуться в главное меню из сцены (без изменений)
calculateCarScene.action("action_main_menu", async (ctx) => {
  console.log("[DEBUG action_main_menu] Triggered in calc scene.");
  if (!ctx.scene || !ctx.callbackQuery) {
    /* проверка контекста */ await ctx.answerCbQuery("Ошибка");
    return;
  }
  await ctx.answerCbQuery();
  try {
    if (
      ctx.callbackQuery.message &&
      ("text" in ctx.callbackQuery.message ||
        "caption" in ctx.callbackQuery.message)
    ) {
      // Пытаемся отредактировать сообщение, ИЗ КОТОРОГО пришел колбэк
      await ctx.editMessageText(messages.mainMenu, keyboards.mainMenu);
    } else {
      // Если редактирование невозможно, отправляем новое
      await ctx.reply(messages.mainMenu, keyboards.mainMenu);
    }
  } catch (e) {
    console.error(
      "Error editing/replying on action_main_menu in calc scene:",
      e
    );
    // Если редактирование не удалось, все равно отправляем новое сообщение
    await ctx.reply(messages.mainMenu, keyboards.mainMenu);
  }
  console.log("[DEBUG] Leaving calc scene for main menu.");
  return ctx.scene.leave(); // Выходим из сцены
});

// Общие команды для выхода из сцены (/cancel, /start) (без изменений)
const cancelAndLeaveCalc = async (ctx: Context) => {
  const commandText =
    ctx.message && "text" in ctx.message ? ctx.message.text : "unknown command";
  console.log(
    `[DEBUG cancelAndLeaveCalc] Command '${commandText}' received in calc scene.`
  );
  await ctx.reply(messages.actionCancelled, Markup.removeKeyboard());
  await ctx.reply(messages.mainMenu, keyboards.mainMenu);
  if (ctx.scene) {
    console.log("[DEBUG] Leaving calc scene via command.");
    return ctx.scene.leave();
  }
};
calculateCarScene.command("cancel", cancelAndLeaveCalc);
calculateCarScene.command("start", cancelAndLeaveCalc);

// Обработчик НЕОЖИДАННОГО текста (можно добавить для отладки или игнорирования)
calculateCarScene.on(message("text"), async (ctx) => {
  if (!ctx.wizard) return; // Добавим проверку
  const currentStep = ctx.wizard.cursor;
  console.log(
    `[DEBUG] Unexpected text received on step ${currentStep}: "${ctx.message.text}"`
  );
  // Можно добавить логику ответа в зависимости от шага
  if (currentStep === 3 || currentStep === 5 || currentStep === 6) {
    // Шаги, где ожидаются кнопки
    await ctx.reply(messages.pleaseUseButtons);
    // Можно повторно показать ожидаемый ввод/кнопки
    if (currentStep === 3) {
      const session = ctx.wizard.state as CalculateCarWizardSession;
      let fuelKeyboard = keyboards.calculatorFuelType;
      if (session.country === "japan")
        fuelKeyboard = keyboards.calculatorFuelTypeJapan;
      await ctx.reply(messages.selectFuelType, fuelKeyboard);
    } else if (currentStep === 5) {
      await ctx.reply(messages.selectCarAge, keyboards.calculatorCarAge);
    } else if (currentStep === 6) {
      // Если пришел текст после результата, можно напомнить про кнопки
      await ctx.reply(
        "Пожалуйста, используйте кнопки 'Рассчитать другой' или 'В Главное меню'.",
        keyboards.calculatorResult
      );
    }
  } else {
    // На шагах, где ожидается текст, это может быть попытка пользователя что-то ввести не то
    // Можно просто проигнорировать или дать подсказку
  }
});
