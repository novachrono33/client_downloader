FROM python:3.10-slim

# Установка полного FFmpeg и дополнительных кодеков
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libavcodec-extra \
    && rm -rf /var/lib/apt/lists/*

# Установка Python зависимостей
RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir fastapi uvicorn "yt-dlp[default]"

# Создаем директорию для временных файлов
RUN mkdir -p /app/tmp && chmod 777 /app/tmp

# Копирование приложения
COPY main.py /app/main.py

WORKDIR /app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]