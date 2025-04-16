// --- src/models/Application.model.ts ---
import mongoose, { Schema, Document } from "mongoose";

// Интерфейс для документа заявки в TypeScript
export interface IApplication extends Document {
  name: string;
  phone: string;
  telegramUsername?: string; // Имя пользователя в Telegram (может отсутствовать)
  telegramUserId: number; // Уникальный ID пользователя в Telegram
  createdAt: Date; // Дата создания записи
}

// Схема Mongoose для коллекции 'applications'
const ApplicationSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Имя обязательно для заявки"], // Сообщение об ошибке валидации
      trim: true, // Удалять пробелы по краям
    },
    phone: {
      type: String,
      required: [true, "Телефон обязателен для заявки"],
      trim: true,
      // Можно добавить валидатор формата телефона при необходимости
      // validate: {
      //   validator: function(v) {
      //     return /^\+?[78]?[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}$/.test(v);
      //   },
      //   message: props => `${props.value} не является корректным номером телефона!`
      // }
    },
    telegramUsername: {
      type: String,
      trim: true,
    },
    telegramUserId: {
      type: Number,
      required: true,
      index: true, // Индекс для быстрого поиска по ID пользователя (если нужно)
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Автоматически добавлять поле createdAt
    versionKey: false, // Не добавлять поле __v
    collection: "applications", // Явно указываем имя коллекции
  }
);

// Создаем и экспортируем модель Mongoose
// Типизируем модель с помощью интерфейса IApplication
export default mongoose.model<IApplication>("Application", ApplicationSchema);
