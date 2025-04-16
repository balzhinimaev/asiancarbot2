// --- src/services/currency.service.ts (в ОСНОВНОМ боте asiancar-bot) ---
import { config } from "../config"; // Импортируем конфиг основного бота (для MOCK значений)
import CurrencyRateModel from "../models/CurrencyRate.model"; // Импортируем ТУ ЖЕ САМУЮ модель, что и в админ-боте

// Интерфейс для объекта с курсами валют
export interface ExchangeRates {
  KRW: number;
  CNY: number;
  JPY: number;
  EUR: number;
}

/**
 * Получает актуальные курсы валют из базы данных MongoDB.
 * Использует коллекцию 'currency_rates', которую обновляет админ-бот.
 * Если курс для какой-либо валюты отсутствует в БД или невалиден,
 * использует MOCK значение из .env основного бота и выводит предупреждение в консоль.
 */
export const getExchangeRates = async (): Promise<ExchangeRates> => {
  // Логируем начало процесса в консоли основного бота
  console.log("[CurrencyService MainBot] Fetching exchange rates from DB...");
  // Список валют, необходимых для калькулятора
  const requiredCodes: (keyof ExchangeRates)[] = ["KRW", "CNY", "JPY", "EUR"];

  try {
    // Запрашиваем из БД записи для нужных валют
    const ratesFromDb = await CurrencyRateModel.find({
      code: { $in: requiredCodes },
    }).exec();

    const rates: Partial<ExchangeRates> = {}; // Временный объект для хранения найденных курсов
    let missingRatesInfo: string[] = []; // Собираем информацию об отсутствующих или MOCK курсах

    // Заполняем объект 'rates' данными из базы данных
    for (const rateDoc of ratesFromDb) {
      // Проверяем, что курс из БД валиден (больше 0)
      if (rateDoc.rate > 0) {
        rates[rateDoc.code as keyof ExchangeRates] = rateDoc.rate;
      } else {
        console.warn(
          `[CurrencyService MainBot] Invalid rate (${rateDoc.rate}) for ${rateDoc.code} found in DB. Will use MOCK.`
        );
        missingRatesInfo.push(`${rateDoc.code} (invalid in DB)`);
      }
    }

    // Проверяем, все ли необходимые курсы были найдены и валидны в БД
    for (const code of requiredCodes) {
      if (rates[code] === undefined || rates[code] === null) {
        // Проверяем только undefined/null, т.к. 0 и <0 обработаны выше
        // Если курс не найден или был невалиден, используем MOCK значение
        console.warn(
          `[CurrencyService MainBot] Rate for ${code} not found in DB! Using MOCK rate: ${config.mockRates[code]}`
        );
        rates[code] = config.mockRates[code]; // Берем MOCK из .env основного бота
        missingRatesInfo.push(`${code} (using MOCK)`);
      }
    }

    // Логируем итоговые курсы, которые будут использованы
    console.log("[CurrencyService MainBot] Effective rates being used:", rates);
    if (missingRatesInfo.length > 0) {
      console.warn(
        `[CurrencyService MainBot] WARNING: The following rates might be outdated or default: ${missingRatesInfo.join(
          ", "
        )}. Please update via admin bot.`
      );
      // TODO: Возможно, стоит добавить уведомление админу, если используются MOCK курсы?
    }

    // На этом этапе объект rates должен содержать все 4 курса
    // (либо из БД, либо MOCK). Мы можем безопасно привести тип.
    return rates as ExchangeRates;
  } catch (error) {
    console.error(
      "[CurrencyService MainBot] CRITICAL ERROR fetching rates from DB:",
      error
    );
    console.error("[CurrencyService MainBot] FALLING BACK TO ALL MOCK RATES!");
    // В случае ЛЮБОЙ ошибки при доступе к БД, возвращаем ТОЛЬКО MOCK значения
    // чтобы калькулятор мог хоть как-то работать, а не падал полностью.
    return config.mockRates; // Возвращаем MOCK из .env основного бота
  }
};
