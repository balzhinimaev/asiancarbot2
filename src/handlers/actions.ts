// --- src/handlers/actions.ts ---
import { Context } from "telegraf";
// Убираем ненужный import message
// import { message } from 'telegraf/filters';
import { messages } from "../constants/messages";
import { keyboards } from "../constants/keyboards";
import { SCENE_IDS } from "../constants/scenes";

/**
 * Обрабатывает нажатия на inline-кнопки (callback_query),
 * которые не обрабатываются внутри конкретных сцен.
 * Этот хендлер вызывается только для обновлений типа 'callback_query'
 * благодаря правильной регистрации в bot.ts (bot.on('callback_query', ...)).
 */
export const actionsHandler = async (ctx: Context) => {
  // --- ИСПРАВЛЕНИЕ: Проверяем наличие callbackQuery и data ---
  // Хотя Telegraf вызывает этот хендлер только для callback_query,
  // строгая проверка не помешает и помогает TypeScript.
  if (
    ctx.updateType !== "callback_query" ||
    !ctx.callbackQuery ||
    !("data" in ctx.callbackQuery)
  ) {
    console.warn(
      "actionsHandler received update that is not a valid callback_query:",
      ctx.update
    );
    // Пытаемся ответить, если возможно, чтобы убрать часики
    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery("Ошибка данных...");
      } catch (e) {
        /* ignore */
      }
    }
    return; // Не обрабатываем
  }
  // --- Конец ИСПРАВЛЕНИЯ ---

  // Теперь TypeScript уверен, что ctx.callbackQuery и ctx.callbackQuery.data существуют
  const action = ctx.callbackQuery.data;
  const user = ctx.from; // ctx.from тоже должен быть для callback_query
  console.log(`Received action: ${action} from user ${user?.id}`);

  // --- ИСПРАВЛЕНИЕ: Проверка user на всякий случай ---
  if (!user) {
    console.error("Critical: ctx.from is undefined in actionsHandler");
    try {
      await ctx.answerCbQuery("Ошибка пользователя...");
    } catch (e) {
      /* ignore */
    }
    return;
  }
  // --- Конец ИСПРАВЛЕНИЯ ---

  // Отвечаем на callback query
  try {
    await ctx.answerCbQuery();
  } catch (e) {
    console.warn(`Could not answer CB query for action ${action}:`, e);
    // Не прерываем выполнение, просто логируем
  }

  try {
    // --- ИСПРАВЛЕНИЕ: Проверка возможности редактирования ---
    const canEdit =
      ctx.callbackQuery.message &&
      ("text" in ctx.callbackQuery.message ||
        "caption" in ctx.callbackQuery.message);
    // --- Конец ИСПРАВЛЕНИЯ ---

    switch (action) {
      // --- Навигация по меню ---
      case "action_main_menu":
        if (ctx.scene?.current) {
          console.warn(
            `Action 'action_main_menu' called while in scene ${ctx.scene.current.id}. Leaving scene.`
          );
          await ctx.scene.leave();
        }
        if (canEdit) {
          await ctx.editMessageText(messages.start, keyboards.mainMenu);
        } else {
          // Если не можем редактировать, возможно, сообщение удалено или это не сообщение вовсе
          console.warn(
            `Cannot edit message for action_main_menu by user ${user.id}`
          );
          // Отправляем новое сообщение как fallback
          await ctx.reply(messages.start, keyboards.mainMenu);
        }
        break;

      case "action_website_menu":
        if (canEdit) {
          await ctx.editMessageText(
            messages.selectWebsite,
            keyboards.websiteMenu
          );
        } else {
          console.warn(
            `Cannot edit message for action_website_menu by user ${user.id}`
          );
          await ctx.reply(messages.selectWebsite, keyboards.websiteMenu);
        }
        break;

      // --- Вход в сцены ---
      case "action_leave_application":
        if (canEdit) {
          // Убираем кнопки перед входом
          await ctx.editMessageReplyMarkup(undefined);
        }
        // Проверяем сцену перед входом
        if (ctx.scene) {
          await ctx.scene.enter(SCENE_IDS.LEAVE_APPLICATION);
        } else {
          console.error(
            `Cannot enter scene ${SCENE_IDS.LEAVE_APPLICATION}: ctx.scene is undefined.`
          );
          await ctx.reply(messages.error); // Сообщаем об ошибке
        }
        break;

      case "action_calculate_car":
        if (canEdit) {
          await ctx.editMessageReplyMarkup(undefined);
        }
        if (ctx.scene) {
          await ctx.scene.enter(SCENE_IDS.CALCULATE_CAR);
        } else {
          console.error(
            `Cannot enter scene ${SCENE_IDS.CALCULATE_CAR}: ctx.scene is undefined.`
          );
          await ctx.reply(messages.error);
        }
        break;

      // --- Другие общие действия ---
      // case 'action_show_contacts':
      //    await ctx.reply("Наши контакты: ...", keyboards.backToMainMenu);
      //    break;

      default:
        // Это действие не обработано здесь. Предполагаем, что оно для сцены.
        // Если бот зависает на какой-то кнопке, возможно, ее обработчик отсутствует в сцене.
        console.warn(
          `Unhandled action in global handler (might be for a scene): ${action}`
        );
        // Не отвечаем пользователю, чтобы не мешать обработке в сцене, если она есть
        break;
    }
  } catch (error) {
    console.error(
      `Error handling global action "${action}" for user ${user.id}:`,
      error
    );
    try {
      // Не пытаемся редактировать, т.к. исходное сообщение могло вызвать ошибку
      await ctx.reply(messages.error);
      if (ctx.scene?.current) {
        await ctx.scene.leave();
      }
      await ctx.reply(messages.mainMenu, keyboards.mainMenu);
    } catch (replyError) {
      console.error(
        "Error sending error message to user after action failure:",
        replyError
      );
    }
  }
};
