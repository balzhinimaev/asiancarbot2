// --- src/types/telegraf.d.ts ---
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Context as TelegrafContext, Scenes } from "telegraf";

// --- Определяем типы данных для сессий сцен ---

// Данные для сцены "Оставить заявку"
export interface LeaveApplicationWizardSession
  extends Scenes.WizardSessionData {
  // Мы будем хранить данные прямо здесь по мере прохождения шагов
  name?: string;
  phone?: string;
}

// Данные для сцены "Рассчитать автомобиль"
export interface CalculateCarWizardSession extends Scenes.WizardSessionData {
  country?: "korea" | "china" | "japan";
  cost?: number; // Стоимость в нац. валюте
  currency?: "KRW" | "CNY" | "JPY"; // Валюта
  fuelType?: "petrol_diesel" | "hybrid" | "electric"; // Тип топлива
  engineVolume?: number; // Объем двигателя (для не-электро)
  enginePower?: number; // Мощность (для электро)
  carAge?: "<3" | "3-5" | ">5"; // Возраст авто
}

// --- Расширяем стандартный контекст Telegraf ---
declare module "telegraf" {
  // Определяем наш кастомный контекст, который будет использоваться везде в боте
  export interface Context extends TelegrafContext {
    // Добавляем поле session с типизацией для наших сцен
    // `Scenes.SceneSession` добавляет поле `__scenes`, которое использует Telegraf для управления сценами
    // Мы объединяем его с нашими данными через `&`
    session: Scenes.SceneSession<
      LeaveApplicationWizardSession | CalculateCarWizardSession
    > & {
      // Сюда можно добавить любые другие данные, которые нужно хранить в сессии вне сцен
      // Например: userPreferences?: Record<string, any>;
      __processing_recalculate?: boolean;
    };

    // Указываем, что `ctx.scene` будет работать с нашим контекстом и нашими типами данных сцен
    scene: Scenes.SceneContextScene<
      Context,
      LeaveApplicationWizardSession | CalculateCarWizardSession
    >;

    // Указываем, что `ctx.wizard` (доступен только внутри WizardScene) будет работать с нашим контекстом
    wizard: Scenes.WizardContextWizard<Context>;
  }
}
