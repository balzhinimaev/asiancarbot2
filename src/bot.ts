// --- src/bot.ts ---
import { Telegraf, session, Context, Markup } from "telegraf";
import { message } from "telegraf/filters";
import { config } from "./config";
import { stage, scenesMiddleware } from "./scenes";
import { startHandler } from "./handlers/start";
import { actionsHandler } from "./handlers/actions";
import { messages } from "./constants/messages";
import { keyboards } from "./constants/keyboards";

// Создаем экземпляр бота с указанием нашего кастомного типа контекста
export const bot = new Telegraf<Context>(config.botToken);

// --- Middleware ---

// 1. Логгирование входящих обновлений (оставляем с type guards)
bot.use(async (ctx, next) => {
  const updateType = ctx.updateType;
  let details = "";
  const userId = ctx.from?.id || "unknown_user";

  if (updateType === "message" && ctx.message) {
    if ("text" in ctx.message) {
      const text = ctx.message.text;
      details = ` text: "${text.substring(0, 50)}${
        text.length > 50 ? "..." : ""
      }"`;
    } else if ("sticker" in ctx.message) {
      details = ` sticker: ${
        ctx.message.sticker.emoji || ctx.message.sticker.file_id
      }`;
    } else if ("photo" in ctx.message) {
      details = ` photo: [${ctx.message.photo.length} sizes]`;
    } else {
      const messageType =
        Object.keys(ctx.message).find(
          (key) => !["message_id", "from", "chat", "date"].includes(key)
        ) || "unknown_type";
      details = ` type: ${messageType}`;
    }
  } else if (updateType === "callback_query" && ctx.callbackQuery) {
    if ("data" in ctx.callbackQuery) {
      details = ` data: ${ctx.callbackQuery.data}`;
    } else {
      details = ` (no data field)`;
    }
  }

  const updateString = `${updateType}${details}`;
  console.log(
    `[${new Date().toISOString()}] Received ${updateString} from ${userId}`
  );
  const start = Date.now();

  await next();

  const ms = Date.now() - start;
  console.log(
    `[${new Date().toISOString()}] Processed ${updateString} from ${userId} in ${ms}ms`
  );
});

// 2. Сессии
bot.use(session());

// 3. Менеджер сцен
bot.use(scenesMiddleware());

// --- Handlers ---
bot.on("channel_post", async (ctx) => {
    console.log(ctx.update.channel_post)
})
// /start и /menu
bot.command("start", startHandler);
bot.command("menu", startHandler);

// Обработка callback_query
bot.on("callback_query", actionsHandler);

// --- Обработка непредвиденных текстовых сообщений ---
// bot.on(message("text"), async (ctx: Context) => {
//     console.log(ctx)
//   // --- ИСПРАВЛЕНИЕ: Добавляем явный Type Guard 'text' in ctx.message ---
//   // Хотя фильтр message('text') должен гарантировать тип,
//   // эта проверка заставит TypeScript быть уверенным.
//   if (ctx.message && "text" in ctx.message && !ctx.scene?.current) {
//     // --- Конец ИСПРАВЛЕНИЯ ---
//     const userId = ctx.from?.id || "?";
//     // Теперь доступ к ctx.message.text точно безопасен для компилятора
//     console.log(
//       `Received unexpected text from user ${userId}: "${ctx.message.text}" (outside scene)`
//     );
//     await ctx.reply(messages.pleaseUseButtons, keyboards.mainMenu);
//   }
// });

// --- Глобальный обработчик ошибок ---
bot.catch((err: unknown, ctx: Context) => {
  let errorMessage = "Unknown error";
  if (err instanceof Error) {
    errorMessage = err.message;
  } else if (typeof err === "string") {
    errorMessage = err;
  }

  const userId = ctx.from?.id || "unknown_user";
  console.error(
    `❌ Global error caught for update ${ctx.updateType} from user ${userId}:`,
    err
  );

  try {
    ctx
      .reply(messages.error)
      .catch((e) => console.error("Failed to send error message to user:", e));

    if (ctx.scene?.current) {
      console.warn(
        `Error occurred in scene ${ctx.scene.current.id}. Attempting to leave scene.`
      );
      ctx.scene
        .leave()
        .then(() => ctx.reply(messages.mainMenu, keyboards.mainMenu))
        .catch((e) =>
          console.error(
            "Failed to leave scene or send main menu after error:",
            e
          )
        );
    } else {
      ctx
        .reply(messages.mainMenu, keyboards.mainMenu)
        .catch((e) =>
          console.error("Failed to send main menu after error:", e)
        );
    }
  } catch (e) {
    console.error(
      "CRITICAL: Error within the error handler (bot.catch) itself:",
      e
    );
  }
});
