// --- src/constants/messages.ts ---
export const messages = {
  // Общие
  start:
    "Здравствуйте, меня зовут Людмила. Я интеллектуальный помощник компании Asiancar.\nЧем я могу Вам помочь?",
  error:
    "Произошла непредвиденная ошибка. Попробуйте еще раз или вернитесь в главное меню.",
  mainMenu: "Вы вернулись в главное меню.",
  actionCancelled: "Действие отменено.",
  pleaseUseButtons: "Пожалуйста, используйте кнопки для навигации.",
  invalidNumber:
    "Неверный формат. Пожалуйста, введите числовое значение (можно с точкой или запятой).",

  // Подбор на сайте
  selectWebsite: "Выберите страну для подбора авто на нашем сайте:",

  // Оставить заявку
  leaveApplicationStart:
    "Чтобы оставить заявку, пожалуйста, ответьте на несколько вопросов.",
  leaveApplicationName: "Введите Ваше имя:",
  leaveApplicationPhone:
    "Введите Ваш номер телефона (например, +79123456789 или 89123456789):",
  invalidPhone:
    "Неверный формат номера телефона. Пожалуйста, введите номер в формате +7XXXXXXXXXX или 8XXXXXXXXXX.",
  applicationConfirm: (name: string, phone: string) =>
    `Проверьте данные:\nИмя: ${name}\nТелефон: ${phone}\n\nОтправить заявку?`,
  applicationSent:
    "✅ Спасибо! Ваша заявка отправлена менеджеру. Мы скоро с Вами свяжемся.",
  applicationForwarded: (name: string, phone: string, username?: string) =>
    `🔔 Новая заявка от @${
      username || "пользователя"
    }:\n\nИмя: ${name}\nТелефон: ${phone}\nUser ID: ${
      username ? `(скрыт, есть @username)` : "(нет @username)"
    }`, // Скрыл user ID для примера

  // Калькулятор
  selectCalculationCountry:
    "Выберите страну происхождения автомобиля для расчета:",
  enterCarCost: (currency: string) =>
    `Введите стоимость авто в ${currency} (только цифры):`,
  selectFuelType: "Выберите тип топлива:",
  enterEngineVolume: "Введите объём двигателя в см³ (только цифры):",
  enterEnginePower: "Введите мощность двигателя в л.с. (только цифры):",
  selectCarAge: "Выберите возраст автомобиля:",
  calculating: "⏳ Рассчитываю стоимость...",
  calculationResultTitle: "⚙️ Предварительный расчет стоимости автомобиля:",
  calculationResultFooter: (totalCost: number) =>
    `\n📊 Итоговая стоимость (ориентировочно): ${totalCost.toLocaleString(
      "ru-RU",
      { maximumFractionDigits: 0 }
    )} руб.\n`,
  calculationResultDisclaimer:
    "\n*Обратите внимание, что расчет является предварительным. Финальная стоимость может незначительно отличаться.*",
  calculationErrorData:
    "Недостаточно данных для расчета. Пожалуйста, начните заново.",
  calculationErrorGeneric: (errorMessage?: string) =>
    `Ошибка при расчете: ${
      errorMessage || "Неизвестная ошибка"
    }. Попробуйте еще раз.`,
};
