// --- src/handlers/start.ts ---
import { Context, Markup } from "telegraf";
import { messages } from "../constants/messages";
import { keyboards } from "../constants/keyboards";

/**
 * Обработчик команды /start.
 * Приветствует пользователя и показывает главное меню.
 * Если пользователь находится в сцене, выходит из нее.
 */
export const startHandler = async (ctx: Context) => {
  const user = ctx.from;
  console.log(
    `User ${user?.id} (${user?.username || "no username"}) started the bot.`
  );

  // Проверяем, находимся ли мы в какой-либо сцене
  if (ctx.scene?.current) {
    console.log(
      `User ${user?.id} was in scene ${ctx.scene.current.id}, leaving...`
    );
    try {
      await ctx.scene.leave();
      // Можно добавить сообщение типа "Предыдущее действие отменено."
      await ctx.reply(messages.actionCancelled, Markup.removeKeyboard());
    } catch (e) {
      console.error(`Error leaving scene for user ${user?.id}:`, e);
    }
  }

  // Отправляем приветственное сообщение и главное меню
  await ctx.reply(messages.start, keyboards.mainMenu);
};
