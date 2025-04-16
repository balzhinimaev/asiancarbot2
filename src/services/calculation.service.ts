// --- src/services/calculation.service.ts ---
import { Scenes } from "telegraf"; // Импортируем Scenes для WizardSessionData
import { getExchangeRates } from "./currency.service";
import { CalculateCarWizardSession } from "../types/telegraf"; // Импортируем тип сессии

// Определяем тип входных параметров для расчета
// Omit убирает стандартные поля WizardSessionData и currency (т.к. валюта определяется внутри)
interface CalculationParams
  extends Omit<
    CalculateCarWizardSession,
    keyof Scenes.WizardSessionData | "currency"
  > {
  // Обязательные поля для всех расчетов
  country: "korea" | "china" | "japan";
  cost: number; // Стоимость в нац. валюте
  fuelType: "petrol_diesel_hybrid" | "electric";
  carAge: "<3" | "3-5" | ">5";
  // Опциональные, но обязательные в зависимости от fuelType
  engineVolume?: number;
  enginePower?: number;
}

// Определяем интерфейс для результата расчета - ДОБАВЛЕНЫ ПОЛЯ
export interface CalculationResult {
  country: "korea" | "china" | "japan"; // Страна (для логики вывода)
  costInOriginalCurrency: number; // Исходная стоимость в нац. валюте
  originalCurrency: "KRW" | "CNY" | "JPY"; // Исходная валюта
  costInRub: number; // Стоимость авто в рублях
  costInEur: number; // Стоимость авто в евро (для логов/деталей)
  deliveryCost: number; // Стоимость доставки
  totalCustomsPayment: number; // Общий таможенный платеж (пошлина + акциз + ндс)
  customsFees: number; // Таможенные сборы (ставка)
  utilizationFee: number; // Утилизационный сбор
  оформленияSbktsepts: number; // Услуги оформления
  companyCommission: number; // Комиссия компании
  totalCost: number; // Итоговая стоимость
  details: string[]; // Массив строк с деталями расчета для логов
}

// --- Константы для расчета ---
const DELIVERY_COST = {
  korea: { value: 2000000, currency: "KRW" as const },
  china: { value: 12000, currency: "CNY" as const, extraRub: 50000 },
  japan: { value: 150000, currency: "JPY" as const },
};
const SERVICES_COST = {
  korea: 80000,
  china: 105000,
  japan: 70000,
};
const COMPANY_COMMISSION = 50000;
const UTILIZATION_FEE = {
  "<3": 3400,
  "3-5": 5200,
  ">5": 5200,
};

// --- Функция форматирования чисел ---
const formatRub = (value: number): string => {
  // Форматируем как валюту RUB без копеек
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
  // Форматируем просто число с нужным кол-вом знаков после запятой
  return value.toLocaleString("ru-RU", { maximumFractionDigits });
};

// --- Основная функция расчета ---
export const calculateCarCost = async (
  params: CalculationParams
): Promise<CalculationResult> => {
  const rates = await getExchangeRates(); // Получаем актуальные курсы
  const details: string[] = []; // Массив для детального лога расчета

  // --- Валидация входных данных ---
  if (
    params.fuelType === "petrol_diesel_hybrid" &&
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
  if (!rates.EUR || rates.EUR <= 0) {
    throw new Error("Не удалось получить или некорректный курс EUR.");
  }
  if (!params.carAge) {
    // Добавим проверку на carAge на всякий случай
    throw new Error("Возраст автомобиля не указан.");
  }

  // Определяем валюту и курс для страны
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

  // 1. Стоимость авто в рублях и евро
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

  // 2. Доставка до Владивостока/Уссурийска
  let deliveryCost = 0;
  const deliveryInfo = DELIVERY_COST[params.country];
  const deliveryCurrencyRate = rates[deliveryInfo.currency];
  if (!deliveryCurrencyRate || deliveryCurrencyRate <= 0) {
    throw new Error(`Некорректный курс ${deliveryInfo.currency} для доставки.`);
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
    `2. Доставка (${deliveryLogParts.join(" + ")}): ${formatRub(deliveryCost)}`
  );

  // 3. Расчет Таможенного ПЛАТЕЖА (пошлина + акциз + НДС)
  let totalCustomsPayment = 0;
  let customsDuty = 0;
  let excise = 0;
  let vat = 0;
  details.push(
    `3. Таможенный платеж (Возраст: ${params.carAge}, Тип: ${params.fuelType}):`
  );

  if (params.fuelType === "electric") {
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
          ).toFixed(0)}%] и ${formatRub(dutyByVolume)} [${formatNum(
            engineVolume
          )}см³*${euroPerCm3Rate}EUR])`
        );
        break;
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
        break;
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
        break;
      }
    }
    totalCustomsPayment = customsDuty;
  }
  details.push(
    `   - Итого таможенный платеж: ${formatRub(totalCustomsPayment)}`
  );

  // 4. Таможенные сборы (ставка)
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

  // 5. Утилизационный сбор
  const utilizationFee = UTILIZATION_FEE[params.carAge];
  details.push(`5. Утилизационный сбор: ${formatRub(utilizationFee)}`);

  // 6. Услуги по оформлению
  const оформленияSbktsepts = SERVICES_COST[params.country];
  details.push(
    `6. Услуги оформления (${params.country}): ${formatRub(
      оформленияSbktsepts
    )}`
  );

  // 7. Комиссия компании
  const companyCommission = COMPANY_COMMISSION;
  details.push(`7. Комиссия компании: ${formatRub(companyCommission)}`);

  // --- Итоговая стоимость ---
  const totalCost =
    costInRub +
    deliveryCost +
    totalCustomsPayment +
    customsFees +
    utilizationFee +
    оформленияSbktsepts +
    companyCommission;
  details.push(`--- ИТОГО: ${formatRub(totalCost)} ---`);

  // Возвращаем объект результата с добавленными полями
  return {
    country: params.country, // Добавили страну
    costInOriginalCurrency: params.cost, // Добавили исходную стоимость
    originalCurrency: nationalCurrency, // Добавили исходную валюту
    costInRub,
    costInEur, // Оставляем для возможной детализации в будущем
    deliveryCost,
    totalCustomsPayment,
    customsFees,
    utilizationFee,
    оформленияSbktsepts,
    companyCommission,
    totalCost,
    details, // Возвращаем детали для логов
  };
};
