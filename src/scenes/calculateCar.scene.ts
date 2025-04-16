// --- src/scenes/calculateCar.scene.ts ---
import { Scenes, Markup, Context, TelegramError } from "telegraf";
import { message } from "telegraf/filters";
import { messages } from "../constants/messages";
import { keyboards } from "../constants/keyboards";
import { SCENE_IDS } from "../constants/scenes";
import { CalculateCarWizardSession } from "../types/telegraf";
import {
  calculateCarCost,
  CalculationResult,
} from "../services/calculation.service";

// --- Функция форматирования ---
const formatRub = (value: number): string => {
  return value.toLocaleString("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  });
};

// --- Вспомогательные функции для шагов сцены ---
const stepHandlers = {
  // Шаг 0: Запрос страны
  askCountry: async (ctx: Context) => {
    console.log("[DEBUG askCountry] Entered step 0.");
    try {
      // Сброс флага блокировки (на всякий случай, если finally не сработал)
      if (ctx.session?.__processing_recalculate) {
        console.log(
          "[DEBUG askCountry] Resetting recalculate lock in session (safety check)."
        );
        delete ctx.session.__processing_recalculate;
      }

      await ctx.reply(
        messages.selectCalculationCountry,
        keyboards.calculatorCountry
      );
      if (ctx.wizard) {
        return ctx.wizard.next();
      } else {
        throw new Error("Wizard context lost in askCountry");
      }
    } catch (error) {
      console.error("[DEBUG askCountry] Error:", error);
      await ctx.reply(messages.error + " Ошибка при запуске калькулятора.");
      if (ctx.scene) return ctx.scene.leave();
    }
  },

  // Шаг 1: Обработка страны, запрос стоимости
  handleCountryAndAskCost: async (ctx: Context) => {
    console.log("[DEBUG handleCountryAndAskCost] Entered step 1.");
    if (
      ctx.updateType !== "callback_query" ||
      !ctx.callbackQuery ||
      !("data" in ctx.callbackQuery) ||
      !ctx.callbackQuery.data.startsWith("calc_country_")
    ) {
      console.log(
        "[DEBUG handleCountryAndAskCost] Ignoring update, not country callback."
      );
      return;
    }
    await ctx.answerCbQuery();
    const country = ctx.callbackQuery.data.split("_")[2] as
      | "korea"
      | "china"
      | "japan";
    // Проверяем наличие wizard перед доступом к state
    if (!ctx.wizard) {
      console.error("[DEBUG handleCountryAndAskCost] ctx.wizard is undefined!");
      await ctx.reply(messages.error + " Ошибка состояния сцены.");
      if (ctx.scene) return ctx.scene.leave();
      else return;
    }
    const session = ctx.wizard.state as CalculateCarWizardSession;
    session.country = country;
    if (country === "korea") session.currency = "KRW";
    else if (country === "china") session.currency = "CNY";
    else if (country === "japan") session.currency = "JPY";
    console.log("[DEBUG handleCountryAndAskCost] Session state:", session);

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
        console.warn("Could not edit markup when handling country:", e);
      }

      try {
        await ctx.reply(
          messages.enterCarCost(session.currency),
          keyboards.backOnly()
        );
        console.log(
          "[DEBUG handleCountryAndAskCost] Selecting step 2 explicitly..."
        );
        ctx.wizard.selectStep(2); // Явно устанавливаем шаг 2
        console.log("[DEBUG handleCountryAndAskCost] Step 2 selected.");
        return;
      } catch (error) {
        console.error(
          "[DEBUG handleCountryAndAskCost] Error replying or selecting step:",
          error
        );
        await ctx.reply(messages.error + " Ошибка при запросе стоимости.");
        if (ctx.scene) return ctx.scene.leave();
      }
    } else {
      console.error(
        "FATAL: Could not determine currency after setting country:",
        country
      );
      await ctx.reply(
        messages.error + " Ошибка: не удалось определить валюту."
      );
      if (ctx.scene) return ctx.scene.leave();
      else return;
    }
  },

  // Шаг 2: Обработка стоимости, запрос типа топлива
  handleCostAndAskFuel: async (ctx: Context) => {
    console.log("[DEBUG handleCostAndAskFuel] Entered step 2.");
    // Проверяем наличие wizard перед доступом к state
    if (!ctx.wizard) {
      console.error("[DEBUG handleCostAndAskFuel] ctx.wizard is undefined!");
      await ctx.reply(messages.error + " Ошибка состояния сцены.");
      if (ctx.scene) return ctx.scene.leave();
      else return;
    }
    if (!ctx.has(message("text")) || !ctx.message.text?.trim()) {
      console.log("[DEBUG handleCostAndAskFuel] Ignoring update, not text.");
      return;
    }
    const costInput = ctx.message.text
      .trim()
      .replace(/\s/g, "")
      .replace(",", ".");
    const cost = parseFloat(costInput);
    console.log(`[DEBUG handleCostAndAskFuel] Parsed cost: ${cost}`);

    if (isNaN(cost) || cost <= 0) {
      console.log(`[DEBUG handleCostAndAskFuel] Invalid cost value: ${cost}`);
      await ctx.reply(messages.invalidNumber);
      const session = ctx.wizard.state as CalculateCarWizardSession;
      if (!session.currency) {
        console.error(
          "[DEBUG handleCostAndAskFuel] Session currency missing (validation)!"
        );
        await ctx.reply(messages.error + " Ошибка сессии (валюта).");
        if (ctx.scene) return ctx.scene.leave();
        else return;
      }
      await ctx.reply(messages.enterCarCost(session.currency));
      return; // Остаемся на шаге 2
    }
    console.log(
      `[DEBUG handleCostAndAskFuel] Cost ${cost} is valid. Saving...`
    );
    try {
      (ctx.wizard.state as CalculateCarWizardSession).cost = cost;
      console.log(
        "[DEBUG handleCostAndAskFuel] Session state:",
        JSON.stringify(ctx.wizard.state)
      );
    } catch (sessionError) {
      console.error(
        "[DEBUG handleCostAndAskFuel] Error saving cost to session:",
        sessionError
      );
      await ctx.reply(messages.error + " Ошибка сохранения данных сессии.");
      if (ctx.scene) return ctx.scene.leave();
      else return;
    }
    try {
      await ctx.reply(messages.selectFuelType, keyboards.calculatorFuelType);
      console.log(
        "[DEBUG handleCostAndAskFuel] Asked fuel type. Moving to step 3..."
      );
      return ctx.wizard.next(); // Возвращаемся к next()
    } catch (replyError) {
      console.error(
        "[DEBUG handleCostAndAskFuel] Error during reply or next step:",
        replyError
      );
      await ctx.reply(messages.error + " Ошибка при запросе типа топлива.");
      if (ctx.scene) return ctx.scene.leave();
      else return;
    }
  },

  // Шаг 3: Обработка типа топлива, запрос V/P
  handleFuelAndAskVolumeOrPower: async (ctx: Context) => {
    console.log("[DEBUG handleFuelAndAskVolumeOrPower] Entered step 3.");
    if (!ctx.wizard) {
      /* проверка wizard */ return;
    } // Добавим проверку
    if (
      ctx.updateType !== "callback_query" ||
      !ctx.callbackQuery ||
      !("data" in ctx.callbackQuery) ||
      !ctx.callbackQuery.data.startsWith("calc_fuel_")
    ) {
      console.log(
        "[DEBUG handleFuelAndAskVolumeOrPower] Ignoring update, not fuel callback."
      );
      return;
    }
    await ctx.answerCbQuery();
    const fuelType = ctx.callbackQuery.data.split("_")[2] as
      | "petrol_diesel_hybrid"
      | "electric";
    const session = ctx.wizard.state as CalculateCarWizardSession;
    session.fuelType = fuelType;
    console.log(
      "[DEBUG handleFuelAndAskVolumeOrPower] Session state:",
      session
    );
    try {
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
      if (fuelType === "electric") {
        await ctx.reply(messages.enterEnginePower, keyboards.backOnly());
      } else {
        await ctx.reply(messages.enterEngineVolume, keyboards.backOnly());
      }
      console.log(
        "[DEBUG handleFuelAndAskVolumeOrPower] Asked V/P. Moving to step 4..."
      );
      return ctx.wizard.next(); // Возвращаемся к next()
    } catch (error) {
      console.error(
        "[DEBUG handleFuelAndAskVolumeOrPower] Error replying or next step:",
        error
      );
      await ctx.reply(messages.error + " Ошибка при запросе характеристик.");
      if (ctx.scene) return ctx.scene.leave();
      else return;
    }
  },

  // Шаг 4: Обработка V/P, запрос возраста
  handleVolumeOrPowerAndAskAge: async (ctx: Context) => {
    console.log("[DEBUG handleVolumeOrPowerAndAskAge] Entered step 4.");
    if (!ctx.wizard) {
      /* проверка wizard */ return;
    } // Добавим проверку
    if (!ctx.has(message("text")) || !ctx.message.text?.trim()) {
      console.log(
        "[DEBUG handleVolumeOrPowerAndAskAge] Ignoring update, not text."
      );
      return;
    }
    const valueInput = ctx.message.text
      .trim()
      .replace(/\s/g, "")
      .replace(",", ".");
    const value = parseInt(valueInput, 10);
    console.log(`[DEBUG handleVolumeOrPowerAndAskAge] Parsed value: ${value}`);
    if (isNaN(value) || value <= 0) {
      console.log(
        `[DEBUG handleVolumeOrPowerAndAskAge] Invalid value: ${value}`
      );
      await ctx.reply(messages.invalidNumber);
      const session = ctx.wizard.state as CalculateCarWizardSession;
      if (session.fuelType === "electric")
        await ctx.reply(messages.enterEnginePower);
      else await ctx.reply(messages.enterEngineVolume);
      return;
    }
    const session = ctx.wizard.state as CalculateCarWizardSession;
    if (session.fuelType === "electric") session.enginePower = value;
    else session.engineVolume = value;
    console.log("[DEBUG handleVolumeOrPowerAndAskAge] Session state:", session);

    try {
      await ctx.reply(messages.selectCarAge, keyboards.calculatorCarAge);
      console.log(
        "[DEBUG handleVolumeOrPowerAndAskAge] Asked age. Moving to step 5..."
      );
      return ctx.wizard.next(); // Возвращаемся к next()
    } catch (error) {
      console.error(
        "[DEBUG handleVolumeOrPowerAndAskAge] Error replying or next step:",
        error
      );
      await ctx.reply(messages.error + " Ошибка при запросе возраста.");
      if (ctx.scene) return ctx.scene.leave();
      else return;
    }
  },

  // Шаг 5: Обработка возраста, расчет и показ результата
  handleAgeAndCalculate: async (ctx: Context) => {
    console.log("[DEBUG handleAgeAndCalculate] Entered step 5.");
    if (!ctx.wizard) {
      /* проверка wizard */ return;
    } // Добавим проверку
    if (
      ctx.updateType !== "callback_query" ||
      !ctx.callbackQuery ||
      !("data" in ctx.callbackQuery) ||
      !ctx.callbackQuery.data.startsWith("calc_age_")
    ) {
      console.log(
        "[DEBUG handleAgeAndCalculate] Ignoring update, not age callback."
      );
      return;
    }
    await ctx.answerCbQuery();
    const age = ctx.callbackQuery.data.split("_")[2] as "<3" | "3-5" | ">5";
    const session = ctx.wizard.state as CalculateCarWizardSession;
    session.carAge = age;
    console.log("[DEBUG handleAgeAndCalculate] Session state:", session);
    try {
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

    await ctx.reply(messages.calculating);

    try {
      // Проверка полноты данных
      if (
        !session.country ||
        typeof session.cost !== "number" ||
        !session.fuelType ||
        !session.carAge ||
        (session.fuelType === "electric" &&
          typeof session.enginePower !== "number") ||
        (session.fuelType !== "electric" &&
          typeof session.engineVolume !== "number")
      ) {
        console.error(
          "FATAL: Incomplete session data before calculation:",
          JSON.stringify(session)
        );
        await ctx.reply(messages.calculationErrorData);
        if (ctx.scene) return ctx.scene.leave();
        else return;
      }
      console.log(
        "[DEBUG handleAgeAndCalculate] Calling calculation service..."
      );
      const result: CalculationResult = await calculateCarCost({
        country: session.country,
        cost: session.cost,
        fuelType: session.fuelType,
        carAge: session.carAge,
        enginePower: session.enginePower,
        engineVolume: session.engineVolume,
      });
      console.log(
        "[DEBUG handleAgeAndCalculate] Calculation finished. Preparing result message..."
      );
      console.log(
        "[DEBUG handleAgeAndCalculate] Calculation details (for log):",
        result.details
      );

      // Формирование упрощенного вывода
      const outputLines: string[] = [];
      outputLines.push(
        `- Стоимость авто (${result.costInOriginalCurrency.toLocaleString(
          "ru-RU"
        )} ${result.originalCurrency}): ${formatRub(result.costInRub)}`
      );
      const deliveryDestination =
        result.country === "china" ? "Уссурийска" : "Владивостока";
      const totalDeliveryAndServices =
        result.deliveryCost + result.оформленияSbktsepts;
      outputLines.push(
        `- Расходы до ${deliveryDestination}: ${formatRub(
          totalDeliveryAndServices
        )}`
      );
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
        `${messages.calculationResultFooter(result.totalCost)}` +
        `${messages.calculationResultDisclaimer}`;

      await ctx.replyWithHTML(resultMessage, keyboards.calculatorResult);
      console.log(
        "[DEBUG handleAgeAndCalculate] Result sent. Moving to step 6..."
      );
    } catch (error: any) {
      console.error(
        "Error during car cost calculation service call or result sending:",
        error
      );
      await ctx.reply(messages.calculationErrorGeneric(error?.message));
      if (ctx.scene) return ctx.scene.leave();
      else return;
    }
    // Переходим к шагу 6 (ожидание кнопок после результата)
    return ctx.wizard.next(); // Возвращаем next()
  },

  // Шаг 6: Ожидание действия после результата
  waitForAfterResultAction: async (ctx: Context) => {
    console.log("[DEBUG waitForAfterResultAction] Entered step 6.");
    // Ждем callback_query или команды
    return; // Остаемся на шаге 6
  },
};

// --- Создание WizardScene ---
export const calculateCarScene = new Scenes.WizardScene<Context>(
  SCENE_IDS.CALCULATE_CAR,
  stepHandlers.askCountry, // step 0
  stepHandlers.handleCountryAndAskCost, // step 1
  stepHandlers.handleCostAndAskFuel, // step 2
  stepHandlers.handleFuelAndAskVolumeOrPower, // step 3
  stepHandlers.handleVolumeOrPowerAndAskAge, // step 4
  stepHandlers.handleAgeAndCalculate, // step 5
  stepHandlers.waitForAfterResultAction // step 6
);

// --- Обработчики действий и команд внутри сцены ---

// Обработка кнопки "Назад" (action_back)
calculateCarScene.action("action_back", async (ctx) => {
  if (!ctx.callbackQuery || !ctx.wizard) {
    /* проверка контекста */ return;
  }
  await ctx.answerCbQuery();
  const currentStep = ctx.wizard.cursor;
  const session = ctx.wizard.state as CalculateCarWizardSession;
  console.log(`[DEBUG action_back] Triggered at step: ${currentStep}`);

  let targetStep: number;
  let replyMessage: string;
  let replyKeyboard: any;

  switch (currentStep) {
    case 1:
      targetStep = 0;
      replyMessage = messages.selectCalculationCountry;
      replyKeyboard = keyboards.calculatorCountry;
      break;
    case 2:
      targetStep = 1;
      replyMessage = messages.selectCalculationCountry;
      replyKeyboard = keyboards.calculatorCountry;
      break;
    case 3:
      targetStep = 2;
      if (!session.currency) {
        /* проверка валюты */ await ctx.reply(
          messages.error + " Ошибка сессии (валюта)."
        );
        if (ctx.scene) return ctx.scene.leave();
        else return;
      }
      replyMessage = messages.enterCarCost(session.currency);
      replyKeyboard = keyboards.backOnly();
      break;
    case 4:
      targetStep = 3;
      replyMessage = messages.selectFuelType;
      replyKeyboard = keyboards.calculatorFuelType;
      break;
    case 5:
      targetStep = 4;
      if (!session.fuelType) {
        /* проверка топлива */ await ctx.reply(
          messages.error + " Ошибка сессии (тип топлива)."
        );
        if (ctx.scene) return ctx.scene.leave();
        else return;
      }
      replyMessage =
        session.fuelType === "electric"
          ? messages.enterEnginePower
          : messages.enterEngineVolume;
      replyKeyboard = keyboards.backOnly();
      break;
    default:
      console.warn(
        `[DEBUG action_back] Back action ignored on step ${currentStep}`
      );
      await ctx.reply("Не могу вернуться назад с этого шага.");
      return;
  }

  try {
    console.log(
      `[DEBUG action_back] Attempting to edit message to step ${targetStep}'s view and select step ${targetStep}`
    );
    if (
      ctx.callbackQuery.message &&
      ("text" in ctx.callbackQuery.message ||
        "caption" in ctx.callbackQuery.message)
    ) {
      try {
        await ctx.editMessageText(replyMessage, replyKeyboard);
      } catch (e: any) {
        /* обработка 'message is not modified' */
        if (
          e instanceof TelegramError &&
          e.response?.description?.includes("message is not modified")
        ) {
          console.warn(`[DEBUG action_back] Message not modified, proceeding.`);
        } else {
          throw e;
        }
      }
    } else {
      console.warn("[DEBUG action_back] Cannot edit message, sending new one.");
      await ctx.reply(replyMessage, replyKeyboard);
    }
    ctx.wizard.selectStep(targetStep);
    console.log(`[DEBUG action_back] Step selected: ${targetStep}`);
  } catch (e) {
    /* обработка других ошибок */
    if (
      !(
        e instanceof TelegramError &&
        e.response?.description?.includes("message is not modified")
      )
    ) {
      console.error("[DEBUG action_back] Error processing back action:", e);
      await ctx.reply(messages.error + " Не удалось вернуться назад.");
    }
  }
});

// --- ИЗМЕНЕННЫЙ ОБРАБОТЧИК action_calculate_car_again ---
calculateCarScene.action("action_calculate_car_again", async (ctx) => {
  console.log("[DEBUG action_calculate_car_again] Triggered.");

  if (!ctx.scene || !ctx.callbackQuery || !ctx.session || !ctx.wizard) {
    console.error(
      "[DEBUG action_calculate_car_again] Missing context (scene, callbackQuery, session, or wizard)."
    );
    try {
      if (ctx.callbackQuery) await ctx.answerCbQuery("Ошибка контекста");
    } catch (e) {
      /* ignore */
    }
    return;
  }

  if (ctx.session.__processing_recalculate) {
    console.warn(
      "[DEBUG action_calculate_car_again] Action is already processing. Ignoring."
    );
    try {
      await ctx.answerCbQuery("Обработка...");
    } catch (e) {
      /* ignore */
    }
    return;
  }
  ctx.session.__processing_recalculate = true;
  console.log(
    "[DEBUG action_calculate_car_again] Processing lock SET in session."
  );

  try {
    await ctx.answerCbQuery();
  } catch (e) {
    console.warn("Failed to answer CB query early:", e);
  }

  try {
    // 1. Убираем кнопки
    try {
      if (
        ctx.callbackQuery.message &&
        ("text" in ctx.callbackQuery.message ||
          "caption" in ctx.callbackQuery.message) &&
        ctx.callbackQuery.message.reply_markup
      ) {
        console.log(
          "[DEBUG action_calculate_car_again] Attempting to remove markup..."
        );
        await ctx.editMessageReplyMarkup(undefined);
        console.log("[DEBUG action_calculate_car_again] Markup removed.");
      } else if (ctx.callbackQuery.message) {
        console.log(
          "[DEBUG action_calculate_car_again] No markup to remove or cannot edit."
        );
      }
    } catch (e: any) {
      /* обработка ошибки 'not modified' и других */
      if (
        e instanceof TelegramError &&
        e.response?.description?.includes("message is not modified")
      ) {
        console.warn(
          "Could not remove markup on recalculate action (message not modified, ignoring)."
        );
      } else {
        console.error("Error removing markup on recalculate action:", e);
      }
    }

    // 2. Отправляем сообщение
    await ctx.reply("Хорошо, давайте рассчитаем другой автомобиль.");
          await ctx.reply(
            messages.selectCalculationCountry,
            keyboards.calculatorCountry
          );
    // 3. Очищаем состояние волшебника
    console.log("[DEBUG action_calculate_car_again] Clearing wizard state.");
    // ctx.wizard.state = {}; // Сбрасываем данные формы

    // // 4. Выходим из сцены
    // console.log("[DEBUG action_calculate_car_again] Leaving current scene...");
    // await ctx.scene.leave();

    // // 5. Небольшая пауза
    // console.log("[DEBUG action_calculate_car_again] Waiting 100ms...");
    // await new Promise((resolve) => setTimeout(resolve, 100));

    // 6. Входим в сцену заново
    console.log("[DEBUG action_calculate_car_again] Entering scene again...");
    // await ctx.scene.enter(SCENE_IDS.CALCULATE_CAR); // Должно вызвать askCountry
    ctx.wizard.selectStep(1)
    console.log(
      "[DEBUG action_calculate_car_again] Scene entered again command sent."
    );
  } catch (error) {
    console.error(
      "[DEBUG action_calculate_car_again] Error during recalculate process:",
      error
    );
    try {
      await ctx.reply(messages.error + " Ошибка при перезапуске расчета.");
    } catch (e) {
      /* ignore */
    }
  } finally {
    // 7. Гарантированно сбрасываем флаг блокировки
    console.log(
      "[DEBUG action_calculate_car_again] Releasing processing lock in session."
    );
    delete ctx.session.__processing_recalculate;
  }
  // Завершаем обработку
  return;
});
// --- КОНЕЦ ИЗМЕНЕННОГО ОБРАБОТЧИКА ---

// Вернуться в главное меню из сцены
calculateCarScene.action("action_main_menu", async (ctx) => {
  console.log("[DEBUG action_main_menu] Triggered in scene.");
  if (!ctx.scene || !ctx.callbackQuery) {
    /* проверка контекста */ return;
  }
  await ctx.answerCbQuery();
  try {
    if (
      ctx.callbackQuery.message &&
      ("text" in ctx.callbackQuery.message ||
        "caption" in ctx.callbackQuery.message)
    ) {
      await ctx.editMessageText(messages.mainMenu, keyboards.mainMenu);
    } else {
      await ctx.reply(messages.mainMenu, keyboards.mainMenu);
    }
  } catch (e) {
    /* обработка ошибки */
    console.error(
      "Error editing/replying on action_main_menu in calc scene:",
      e
    );
    await ctx.reply(messages.mainMenu, keyboards.mainMenu);
  }
  return ctx.scene.leave(); // Выходим из сцены
});

// Общие команды для выхода из сцены (/cancel, /start)
const cancelAndLeaveCalc = async (ctx: Context) => {
  const commandText =
    ctx.message && "text" in ctx.message ? ctx.message.text : "unknown command";
  console.log(
    `[DEBUG cancelAndLeaveCalc] Command '${commandText}' received in scene.`
  );
  await ctx.reply(messages.actionCancelled, Markup.removeKeyboard());
  await ctx.reply(messages.mainMenu, keyboards.mainMenu);
  if (ctx.scene) return ctx.scene.leave();
};
calculateCarScene.command("cancel", cancelAndLeaveCalc);
calculateCarScene.command("start", cancelAndLeaveCalc);

// Обработчик НЕОЖИДАННОГО текста закомментирован
// calculateCarScene.on(message("text"), async (ctx) => { ... });
