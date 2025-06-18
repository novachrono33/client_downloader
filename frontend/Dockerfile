# Dockerfile (front)
FROM node:18-alpine
WORKDIR /app

# получаем API_URL из аргумента
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json package-lock.json ./
RUN npm install

COPY . .
# теперь на этом шаге VITE_API_URL уже видна
RUN npm run build

RUN npm install -g serve
CMD ["serve", "-s", "dist", "-l", "3000"]