// --- src/scenes/leaveApplication.scene.ts ---
import { Scenes, Markup, Context } from "telegraf";
import { message } from "telegraf/filters"; // Для фильтрации типов сообщений
import { messages } from "../constants/messages";
import { keyboards } from "../constants/keyboards";
import { SCENE_IDS } from "../constants/scenes";
import Application from "../models/Application.model";
import { config } from "../config";
import { LeaveApplicationWizardSession } from "../types/telegraf";

// Создаем WizardScene с указанием типа контекста
export const leaveApplicationScene = new Scenes.WizardScene<Context>(
  SCENE_IDS.LEAVE_APPLICATION,

  // Шаг 0: Вход в сцену, запрос имени
  async (ctx) => {
    await ctx.reply(messages.leaveApplicationStart);
    await ctx.reply(messages.leaveApplicationName, keyboards.cancelScene);
    return ctx.wizard.next();
  },

  // Шаг 1: Обработка имени, запрос телефона
  async (ctx) => {
    // Используем ctx.has для проверки наличия текстового сообщения
    if (!ctx.has(message("text")) || !ctx.message.text?.trim()) {
      await ctx.reply(messages.leaveApplicationName);
      return;
    }

    const session = ctx.wizard.state as LeaveApplicationWizardSession;
    session.name = ctx.message.text.trim();

    await ctx.reply(messages.leaveApplicationPhone, keyboards.backOnly());
    return ctx.wizard.next();
  },

  // Шаг 2: Обработка телефона, показ подтверждения
  async (ctx) => {
    if (!ctx.has(message("text")) || !ctx.message.text?.trim()) {
      await ctx.reply(messages.leaveApplicationPhone);
      return;
    }
    const phoneInput = ctx.message.text.trim();
    const phoneRegex =
      /^\+?[78]?[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}$/;
    if (!phoneRegex.test(phoneInput)) {
      await ctx.reply(messages.invalidPhone);
      return;
    }

    const normalizedPhone = phoneInput
      .replace(/[^\d+]/g, "")
      .replace(/^8/, "+7");

    const session = ctx.wizard.state as LeaveApplicationWizardSession;
    session.phone = normalizedPhone;
    const name = session.name;

    if (!name) {
      await ctx.reply(messages.error + " Не найдено имя. Попробуйте снова.");
      // Важно выйти из сцены, если данные потеряны
      return ctx.scene.leave().then(async () => {
        await ctx.reply(messages.mainMenu, keyboards.mainMenu);
      });
    }

    await ctx.reply(
      messages.applicationConfirm(name, normalizedPhone),
      keyboards.leaveApplicationConfirm
    );
    return ctx.wizard.next();
  },

  // Шаг 3: Ожидание и обработка подтверждения (нажатие кнопки "Отправить")
  async (ctx) => {
    // --- ИСПРАВЛЕНИЕ: Проверяем тип обновления и данные напрямую ---
    // Убедимся, что это callback_query и есть поле data
    if (
      ctx.updateType !== "callback_query" ||
      !ctx.callbackQuery ||
      !("data" in ctx.callbackQuery)
    ) {
      // Если пришло что-то другое (текст и т.д.)
      await ctx.reply(messages.pleaseUseButtons);
      // Можно повторно показать сообщение с кнопками подтверждения
      const session = ctx.wizard.state as LeaveApplicationWizardSession;
      if (session.name && session.phone) {
        await ctx.reply(
          messages.applicationConfirm(session.name, session.phone),
          keyboards.leaveApplicationConfirm
        );
      }
      return; // Остаемся на этом шаге
    }

    // Теперь мы точно знаем, что ctx.callbackQuery существует
    if (ctx.callbackQuery.data !== "action_send_application") {
      // Если нажали не ту кнопку (например, "Назад", хотя она должна обрабатываться отдельно)
      await ctx.reply(messages.pleaseUseButtons);
      // Возможно, стоит обработать 'action_back' здесь тоже или убедиться, что он обработан ранее
      return;
    }
    // --- Конец ИСПРАВЛЕНИЯ ---

    const session = ctx.wizard.state as LeaveApplicationWizardSession;
    const { name, phone } = session;
    const user = ctx.from; // ctx.from здесь должен быть, т.к. это callback_query от пользователя

    // --- ИСПРАВЛЕНИЕ: Добавим проверку на user ---
    if (!user) {
      console.error(
        "Critical: ctx.from is undefined in step 3 of leaveApplicationScene"
      );
      await ctx.reply(
        messages.error + " Не удалось идентифицировать пользователя."
      );
      return ctx.scene.leave();
    }
    // --- Конец ИСПРАВЛЕНИЯ ---

    if (!name || !phone) {
      // Проверка name/phone остается
      await ctx.reply(
        messages.error + " Отсутствуют данные (имя или телефон) для отправки."
      );
      return ctx.scene.leave();
    }

    try {
      await ctx.answerCbQuery("Отправляем заявку..."); // Ответ на нажатие кнопки 'action_send_application'

      const application = new Application({
        name,
        phone,
        telegramUserId: user.id,
        telegramUsername: user.username,
      });
      await application.save();
      console.log(`Application saved: ${name}, ${phone}, User: ${user.id}`);

      if (config.adminChatId) {
        try {
          await ctx.telegram.sendMessage(
            config.adminChatId,
            messages.applicationForwarded(name, phone, user.username)
            // Убрал parse_mode, т.к. в messages.applicationForwarded нет разметки
          );
        } catch (adminNotifyError) {
          console.error(
            "Failed to send application to admin:",
            adminNotifyError
          );
        }
      } else {
        console.warn("ADMIN_CHAT_ID not set, skipping notification.");
      }

      // --- ИСПРАВЛЕНИЕ: Убираем кнопки через editMessageReplyMarkup ---
      // Мы уверены, что ctx.callbackQuery существует
      await ctx.editMessageReplyMarkup(undefined);
      // --- Конец ИСПРАВЛЕНИЯ ---
      await ctx.reply(messages.applicationSent, keyboards.backToMainMenu);
    } catch (error) {
      console.error("Error processing application submission:", error);
      await ctx.reply(messages.error);
    }

    return ctx.scene.leave();
  }
);

// --- Обработчики действий и команд внутри сцены ---

// Обработка кнопки "Назад" (action_back)
leaveApplicationScene.action("action_back", async (ctx) => {
  // Убедимся, что ctx.callbackQuery существует перед ответом
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
  } else {
    // Это не должно произойти для action, но на всякий случай
    console.warn("action_back triggered without callbackQuery");
    return;
  }

  const currentStep = ctx.wizard.cursor;

  try {
    // Убедимся, что сообщение можно редактировать
    if (
      !ctx.callbackQuery.message ||
      !(
        "text" in ctx.callbackQuery.message ||
        "caption" in ctx.callbackQuery.message
      )
    ) {
      console.warn("Cannot edit message on action_back");
      // Можно отправить новое сообщение или просто изменить шаг
      if (currentStep === 2) ctx.wizard.selectStep(1);
      else if (currentStep === 3) ctx.wizard.selectStep(2);
      return;
    }

    if (currentStep === 1) {
      // Были на вводе имени -> Выход
      await ctx.editMessageText(messages.actionCancelled);
      await ctx.reply(messages.mainMenu, keyboards.mainMenu);
      return ctx.scene.leave();
    } else if (currentStep === 2) {
      // Были на вводе телефона -> Возврат к имени
      await ctx.editMessageText(
        messages.leaveApplicationName,
        keyboards.cancelScene
      );
      ctx.wizard.selectStep(1);
    } else if (currentStep === 3) {
      // Были на подтверждении -> Возврат к телефону
      await ctx.editMessageText(
        messages.leaveApplicationPhone,
        keyboards.backOnly()
      );
      ctx.wizard.selectStep(2);
    }
  } catch (e) {
    console.error("Error processing back action in leaveApplication scene:", e);
    await ctx.reply(messages.error + " Не удалось вернуться назад.");
  }
});

// Обработка кнопки "Отмена" (action_cancel_scene)
leaveApplicationScene.action("action_cancel_scene", async (ctx) => {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  try {
    // Попытка отредактировать сообщение
    if (
      ctx.callbackQuery?.message &&
      ("text" in ctx.callbackQuery.message ||
        "caption" in ctx.callbackQuery.message)
    ) {
      await ctx.editMessageText(messages.actionCancelled);
    } else {
      await ctx.reply(messages.actionCancelled);
    }
  } catch (e) {
    console.warn("Could not edit message on cancel action:", e);
    await ctx.reply(messages.actionCancelled); // Отправляем новое, если редактирование не удалось
  }
  await ctx.reply(messages.mainMenu, keyboards.mainMenu);
  return ctx.scene.leave();
});

const cancelAndLeave = async (ctx: Context) => {
  await ctx.reply(messages.actionCancelled, Markup.removeKeyboard());
  await ctx.reply(messages.mainMenu, keyboards.mainMenu);
  // Убедимся, что сцена существует перед выходом
  if (ctx.scene) {
    return ctx.scene.leave();
  }
};
leaveApplicationScene.command("cancel", cancelAndLeave);
leaveApplicationScene.command("start", cancelAndLeave);

// // Обработчик неожиданного текста на шаге 3
// leaveApplicationScene.on(message("text"), async (ctx) => {
//   if (ctx.wizard.cursor === 3) {
//     await ctx.reply(messages.pleaseUseButtons);
//     const session = ctx.wizard.state as LeaveApplicationWizardSession;
//     if (session.name && session.phone) {
//       await ctx.reply(
//         messages.applicationConfirm(session.name, session.phone),
//         keyboards.leaveApplicationConfirm
//       );
//     }
//   }
//   // На других шагах текст ожидается
// });
