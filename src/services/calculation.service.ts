// --- src/services/calculation.service.ts ---
import { Scenes } from "telegraf"; // Импортируем Scenes для WizardSessionData
import { getExchangeRates } from "./currency.service";
// Импортируем тип сессии (убедитесь, что он уже обновлен в types/telegraf.d.ts)
import { CalculateCarWizardSession } from "../types/telegraf";

// Определяем тип входных параметров для расчета
// Omit убирает стандартные поля WizardSessionData и currency
interface CalculationParams
  extends Omit<
    CalculateCarWizardSession,
    keyof Scenes.WizardSessionData | "currency" // Убираем currency, т.к. определяем его по стране
  > {
  // Убедимся, что все нужные поля ОБЯЗАТЕЛЬНЫ для функции расчета
  // Типы здесь уже должны быть обновлены в соответствии с types/telegraf.d.ts
  country: "korea" | "china" | "japan";
  cost: number;
  fuelType: "petrol_diesel" | "hybrid" | "electric"; // <<< ИЗМЕНЕНО
  carAge: "<3" | "3-5" | ">5";
  // Опциональные здесь, но обязательные внутри логики функции
  engineVolume?: number; // Объем для petrol_diesel и hybrid
  enginePower?: number; // Мощность для electric
}

// Определяем интерфейс для результата расчета (остается без изменений)
export interface CalculationResult {
  country: "korea" | "china" | "japan";
  costInOriginalCurrency: number;
  originalCurrency: "KRW" | "CNY" | "JPY";
  costInRub: number;
  costInEur: number;
  deliveryCost: number;
  totalCustomsPayment: number;
  customsFees: number;
  utilizationFee: number;
  оформленияSbktsepts: number; // Услуги оформления/Брокер
  companyCommission: number;
  totalCost: number;
  details: string[];
}

// --- Обновленные константы для расчета ---
const DELIVERY_COST = {
  // Удаляем Японию отсюда
  korea: { value: 2000000, currency: "KRW" as const },
  china: { value: 12000, currency: "CNY" as const, extraRub: 50000 },
};
// Новые константы для доставки из Японии
const STANDARD_DELIVERY_JAPAN_JPY = 150000; // Стандартная доставка
const SPECIAL_DELIVERY_JAPAN_MIN_JPY = 70000; // Минимальная ставка (от 5%)
const SPECIAL_DELIVERY_JAPAN_EXTRA_RUB = 475000; // Добавка в рублях для спец. условий

const SERVICES_COST = {
  // Обновляем стоимость для Японии
  korea: 80000,
  china: 105000,
  japan: 80000, // <<< ИЗМЕНЕНО (было 70000)
};
const COMPANY_COMMISSION = 50000;
const UTILIZATION_FEE = {
  "<3": 3400,
  "3-5": 5200,
  ">5": 5200,
};

// --- Функция форматирования чисел (без изменений) ---
const formatRub = (value: number): string => {
  return value.toLocaleString("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  });
};
const formatNum = (
  value: number,
  maximumFractionDigits: number = 0
): string => {
  return value.toLocaleString("ru-RU", { maximumFractionDigits });
};

// --- Основная функция расчета (С ИЗМЕНЕНИЯМИ) ---
export const calculateCarCost = async (
  params: CalculationParams
): Promise<CalculationResult> => {
  const rates = await getExchangeRates(); // Получаем актуальные курсы
  const details: string[] = []; // Массив для детального лога расчета

  // --- Валидация входных данных (ОБНОВЛЕНО) ---
  if (
    (params.fuelType === "petrol_diesel" || params.fuelType === "hybrid") && // <<< ИЗМЕНЕНО
    typeof params.engineVolume !== "number"
  ) {
    throw new Error(
      "Объем двигателя обязателен для бензиновых/дизельных/гибридных авто."
    );
  }
  if (
    params.fuelType === "electric" &&
    typeof params.enginePower !== "number"
  ) {
    throw new Error("Мощность двигателя обязательна для электромобилей.");
  }
  // <<< ДОБАВЛЕНО: Запрет электро для Японии >>>
  if (params.country === "japan" && params.fuelType === "electric") {
    throw new Error("Расчет для электромобилей из Японии не поддерживается.");
  }
  if (!rates.EUR || rates.EUR <= 0) {
    throw new Error("Не удалось получить или некорректный курс EUR.");
  }
  if (!params.carAge) {
    throw new Error("Возраст автомобиля не указан.");
  }

  // Определяем валюту и курс для страны (без изменений)
  let nationalCurrency: "KRW" | "CNY" | "JPY";
  let nationalRate: number;
  switch (params.country) {
    case "korea":
      nationalCurrency = "KRW";
      nationalRate = rates.KRW;
      break;
    case "china":
      nationalCurrency = "CNY";
      nationalRate = rates.CNY;
      break;
    case "japan":
      nationalCurrency = "JPY";
      nationalRate = rates.JPY;
      break;
    default:
      throw new Error("Неизвестная страна.");
  }
  if (!nationalRate || nationalRate <= 0) {
    throw new Error(
      `Не удалось получить или некорректный курс ${nationalCurrency}.`
    );
  }

  // 1. Стоимость авто в рублях и евро (без изменений)
  const costInRub = params.cost * nationalRate;
  const costInEur = Math.round(costInRub / rates.EUR);
  details.push(
    `1. Стоимость авто (${formatNum(
      params.cost
    )} ${nationalCurrency}): ${formatRub(costInRub)}`
  );
  details.push(
    `   (≈ ${formatNum(costInEur)} EUR @ ${formatNum(rates.EUR, 2)} RUB/EUR)`
  );

  // 2. Доставка до Владивостока/Уссурийска (ЛОГИКА ИЗМЕНЕНА ДЛЯ ЯПОНИИ)
  let deliveryCost = 0;
  details.push("2. Доставка:"); // Заголовок для ясности

  if (params.country === "korea" || params.country === "china") {
    // Логика для Кореи и Китая (как было)
    const deliveryInfo = DELIVERY_COST[params.country];
    const deliveryCurrencyRate = rates[deliveryInfo.currency];
    if (!deliveryCurrencyRate || deliveryCurrencyRate <= 0) {
      throw new Error(
        `Некорректный курс ${deliveryInfo.currency} для доставки.`
      );
    }
    deliveryCost = deliveryInfo.value * deliveryCurrencyRate;
    const deliveryLogParts: string[] = [
      `${formatNum(deliveryInfo.value)} ${deliveryInfo.currency}`,
    ];
    if ("extraRub" in deliveryInfo && deliveryInfo.extraRub) {
      deliveryCost += deliveryInfo.extraRub;
      deliveryLogParts.push(`${formatRub(deliveryInfo.extraRub)}`);
    }
    details.push(
      `   - ${params.country.toUpperCase()}: (${deliveryLogParts.join(
        " + "
      )}) = ${formatRub(deliveryCost)}`
    );
  } else if (params.country === "japan") {
    // Логика для Японии
    const deliveryCurrencyRate = rates.JPY; // Используем курс JPY
    if (!deliveryCurrencyRate || deliveryCurrencyRate <= 0) {
      throw new Error(`Некорректный курс JPY для доставки.`);
    }

    // Определяем, применяются ли спец. условия
    // Спец. условия: Гибрид ИЛИ (Бензин/Дизель И Объем > 1900)
    const isSpecialDeliveryCase =
      params.fuelType === "hybrid" ||
      (params.fuelType === "petrol_diesel" && params.engineVolume! > 1900); // Используем non-null assertion !, т.к. объем проверен в валидации

    if (isSpecialDeliveryCase) {
      // Расчет для спец. условий
      const costPercent = params.cost * 0.05; // 5% от стоимости авто в JPY
      const baseDeliveryCostJPY = Math.max(
        costPercent,
        SPECIAL_DELIVERY_JAPAN_MIN_JPY
      ); // Не менее 70 000 JPY
      deliveryCost =
        baseDeliveryCostJPY * deliveryCurrencyRate +
        SPECIAL_DELIVERY_JAPAN_EXTRA_RUB; // (База * курс) + добавка в RUB

      details.push(`   - JPN (Спец. условия: >1900cc или Гибрид)`);
      details.push(
        `     База JPY: max(5% от ${formatNum(params.cost)} JPY [=${formatNum(
          costPercent
        )}], ${formatNum(SPECIAL_DELIVERY_JAPAN_MIN_JPY)} JPY) = ${formatNum(
          baseDeliveryCostJPY
        )} JPY`
      );
      details.push(
        `     Расчет: (${formatNum(baseDeliveryCostJPY)} JPY * ${formatNum(
          deliveryCurrencyRate,
          4
        )} RUB/JPY) + ${formatRub(
          SPECIAL_DELIVERY_JAPAN_EXTRA_RUB
        )} = ${formatRub(deliveryCost)}`
      );
    } else {
      // Стандартные условия для Японии (бензин/дизель <= 1900cc)
      deliveryCost = STANDARD_DELIVERY_JAPAN_JPY * deliveryCurrencyRate; // Стандартная ставка * курс
      details.push(`   - JPN (Стандарт: Бензин/Дизель <= 1900cc)`);
      details.push(
        `     Расчет: ${formatNum(
          STANDARD_DELIVERY_JAPAN_JPY
        )} JPY * ${formatNum(deliveryCurrencyRate, 4)} RUB/JPY = ${formatRub(
          deliveryCost
        )}`
      );
    }
  }
  // Добавляем пустую строку для разделения, если нужно
  // details.push('');

  // 3. Расчет Таможенного ПЛАТЕЖА (пошлина + акциз + НДС)
  let totalCustomsPayment = 0;
  let customsDuty = 0;
  let excise = 0;
  let vat = 0;
  // Отображаем корректный fuelType в логе
  details.push(
    `3. Таможенный платеж (Возраст: ${params.carAge}, Тип: ${params.fuelType}):`
  );

  if (params.fuelType === "electric") {
    // Логика для электромобилей (остается без изменений)
    const enginePower = params.enginePower!;
    customsDuty = costInRub * 0.15;
    details.push(`   - Пошлина (15%): ${formatRub(customsDuty)}`);
    let exciseRatePerHp = 0;
    if (enginePower >= 91 && enginePower <= 150) exciseRatePerHp = 61;
    else if (enginePower >= 151 && enginePower <= 200) exciseRatePerHp = 583;
    else if (enginePower >= 201 && enginePower <= 300) exciseRatePerHp = 955;
    else if (enginePower >= 301 && enginePower <= 400) exciseRatePerHp = 1628;
    else if (enginePower >= 401 && enginePower <= 500) exciseRatePerHp = 1685;
    else if (enginePower >= 501) exciseRatePerHp = 1740;
    excise = enginePower * exciseRatePerHp;
    details.push(
      `   - Акциз (${formatNum(enginePower)} л.с. × ${formatNum(
        exciseRatePerHp
      )}): ${formatRub(excise)}`
    );
    vat = (costInRub + customsDuty + excise) * 0.2;
    details.push(`   - НДС (20% от суммы выше): ${formatRub(vat)}`);
    totalCustomsPayment = customsDuty + excise + vat;
  } else {
    // Теперь это petrol_diesel ИЛИ hybrid
    // Логика пошлины для не-электро (остается без изменений, т.к. зависит от объема/возраста/стоимости)
    const engineVolume = params.engineVolume!;
    switch (params.carAge) {
      case "<3": {
        let percentageRate = 0,
          euroPerCm3Rate = 0;
        if (costInEur <= 8500) {
          percentageRate = 0.54;
          euroPerCm3Rate = 2.5;
        } else if (costInEur <= 16700) {
          percentageRate = 0.48;
          euroPerCm3Rate = 3.5;
        } else if (costInEur <= 42300) {
          percentageRate = 0.48;
          euroPerCm3Rate = 5.5;
        } else if (costInEur <= 84500) {
          percentageRate = 0.48;
          euroPerCm3Rate = 7.5;
        } else if (costInEur <= 169000) {
          percentageRate = 0.48;
          euroPerCm3Rate = 15;
        } else {
          percentageRate = 0.48;
          euroPerCm3Rate = 20;
        }

        const dutyByPercentage = costInRub * percentageRate;
        const dutyByVolume = engineVolume * euroPerCm3Rate * rates.EUR;
        customsDuty = Math.max(dutyByPercentage, dutyByVolume);
        details.push(
          `   - Пошлина (max от ${formatRub(dutyByPercentage)} [${(
            percentageRate * 100
          ).toFixed(0)}%] или ${formatRub(dutyByVolume)} [${formatNum(
            engineVolume
          )}см³*${euroPerCm3Rate} EUR/см³])`
        );
        break; // <-- Убедитесь, что break здесь есть
      }
      case "3-5": {
        let euroPerCm3Rate = 0;
        if (engineVolume <= 1000) euroPerCm3Rate = 1.5;
        else if (engineVolume <= 1500) euroPerCm3Rate = 1.7;
        else if (engineVolume <= 1800) euroPerCm3Rate = 2.5;
        else if (engineVolume <= 2300) euroPerCm3Rate = 2.7;
        else if (engineVolume <= 3000) euroPerCm3Rate = 3.0;
        else euroPerCm3Rate = 3.6;
        customsDuty = engineVolume * euroPerCm3Rate * rates.EUR;
        details.push(
          `   - Пошлина (${formatNum(
            engineVolume
          )}см³ × ${euroPerCm3Rate} EUR/см³ × ${formatNum(
            rates.EUR,
            2
          )} RUB/EUR)`
        );
        break; // <-- Убедитесь, что break здесь есть
      }
      case ">5": {
        let euroPerCm3Rate = 0;
        if (engineVolume <= 1000) euroPerCm3Rate = 3.0;
        else if (engineVolume <= 1500) euroPerCm3Rate = 3.2;
        else if (engineVolume <= 1800) euroPerCm3Rate = 3.5;
        else if (engineVolume <= 2300) euroPerCm3Rate = 4.8;
        else if (engineVolume <= 3000) euroPerCm3Rate = 5.0;
        else euroPerCm3Rate = 5.7;
        customsDuty = engineVolume * euroPerCm3Rate * rates.EUR;
        details.push(
          `   - Пошлина (${formatNum(
            engineVolume
          )}см³ × ${euroPerCm3Rate} EUR/см³ × ${formatNum(
            rates.EUR,
            2
          )} RUB/EUR)`
        );
        break; // <-- Убедитесь, что break здесь есть
      }
    }
    // Для не-электромобилей по этой схеме акциз и НДС не добавляются отдельно (считаются включенными в ставку EUR/см³)
    totalCustomsPayment = customsDuty;
  }
  details.push(
    `   - Итого таможенный платеж: ${formatRub(totalCustomsPayment)}`
  );

  // 4. Таможенные сборы (ставка) - Без изменений
  let customsFees = 0;
  if (costInRub <= 1200000) customsFees = 3100;
  else if (costInRub <= 2700000) customsFees = 8530;
  else if (costInRub <= 4200000) customsFees = 12000;
  else if (costInRub <= 5500000) customsFees = 15500;
  else if (costInRub <= 7000000) customsFees = 20000;
  else if (costInRub <= 8000000) customsFees = 23000;
  else if (costInRub <= 9000000) customsFees = 25000;
  else if (costInRub <= 10000000) customsFees = 27000;
  else customsFees = 30000;
  details.push(`4. Таможенные сборы (ставка): ${formatRub(customsFees)}`);

  // 5. Утилизационный сбор - Без изменений
  const utilizationFee = UTILIZATION_FEE[params.carAge];
  details.push(`5. Утилизационный сбор: ${formatRub(utilizationFee)}`);

  // 6. Услуги по оформлению / Брокер (СТОИМОСТЬ ОБНОВЛЕНА)
  const оформленияSbktsepts = SERVICES_COST[params.country]; // Используем обновленную константу
  details.push(
    `6. Услуги оформления/Брокер (${params.country}): ${formatRub(
      // <<< Изменен текст
      оформленияSbktsepts
    )}`
  );

  // 7. Комиссия компании - Без изменений
  const companyCommission = COMPANY_COMMISSION;
  details.push(`7. Комиссия компании: ${formatRub(companyCommission)}`);

  // --- Итоговая стоимость (складывает обновленные компоненты) ---
  const totalCost =
    costInRub +
    deliveryCost + // <<< Включает обновленную стоимость доставки
    totalCustomsPayment +
    customsFees +
    utilizationFee +
    оформленияSbktsepts + // <<< Включает обновленную стоимость услуг
    companyCommission;
  details.push(`---`); // Разделитель перед итогом
  details.push(`ИТОГО: ${formatRub(totalCost)}`);

  // Возвращаем объект результата (без изменений в структуре)
  return {
    country: params.country,
    costInOriginalCurrency: params.cost,
    originalCurrency: nationalCurrency,
    costInRub,
    costInEur,
    deliveryCost,
    totalCustomsPayment,
    customsFees,
    utilizationFee,
    оформленияSbktsepts,
    companyCommission,
    totalCost,
    details,
  };
};
