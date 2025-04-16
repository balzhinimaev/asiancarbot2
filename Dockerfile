# 1. Используем стандартный образ Node.js 18
FROM node:18

# 2. Устанавливаем рабочую директорию
WORKDIR /usr/src/app

# 3. Копируем package.json и package-lock.json
COPY package*.json ./

# 4. Устанавливаем ВСЕ зависимости
RUN npm install

# 5. Копируем весь остальной код
COPY . .

# 6. Собираем TypeScript
RUN npm run build

# 7. Указываем ПРЕДПОЛАГАЕМЫЙ порт приложения (из .env)
EXPOSE 5001

# 8. Команда для запуска приложения
# Убедитесь, что скрипт start в package.json: "node -r tsconfig-paths/register dist/app.js"
CMD [ "npm", "start" ]