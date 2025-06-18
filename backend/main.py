import os
import re
import subprocess
import tempfile
import time
import urllib.parse
import logging
import shutil
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DownloadRequest(BaseModel):
    url: str
    cookies: str = None

app = FastAPI()

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def sanitize_filename(name: str) -> str:
    """Очищает имя файла от недопустимых символов"""
    return re.sub(r'[\\/*?:"<>|]', "_", name)

def convert_to_netscape_format(cookie_str: str) -> str:
    """Конвертирует строку cookies в формат Netscape"""
    lines = ["# Netscape HTTP Cookie File"]
    for cookie in cookie_str.split('; '):
        if '=' in cookie:
            name, value = cookie.split('=', 1)
            # Формат: domain access_flag path secure_flag expiration name value
            lines.append(f".yandex.ru\tTRUE\t/\tFALSE\t0\t{name}\t{value}")
    return "\n".join(lines)

def get_metadata(url: str, cookies: str = None) -> tuple:
    """Получает метаданные трека через yt-dlp"""
    cmd = [
        "yt-dlp",
        "--quiet",
        "--no-warnings",
        "--skip-download",
        "--print", "%(artist)s|||%(title)s",
    ]
    
    try:
        # Создаем временный файл для cookies
        cookies_path = None
        if cookies:
            cookies_path = "cookies.txt"
            with open(cookies_path, "w", encoding="utf-8") as f:
                f.write(convert_to_netscape_format(cookies))
            cmd += ["--cookies", cookies_path]
        
        cmd.append(url)
        
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        
        parts = result.stdout.strip().split("|||")
        if len(parts) < 2:
            return ("Unknown", "Unknown")
        
        # Обработка формата названия
        artist = parts[0]
        title = parts[1]
        
        # Удаляем повторяющееся имя артиста из начала названия
        if title.startswith(artist + " - "):
            title = title[len(artist) + 3:]
        
        return (artist, title)
    except subprocess.CalledProcessError as e:
        logger.error(f"Ошибка получения метаданных: {e.stderr}")
        return ("Unknown", "Unknown")
    finally:
        # Удаляем временный файл cookies
        if cookies and os.path.exists("cookies.txt"):
            os.remove("cookies.txt")

@app.post("/download/")
async def download(req: DownloadRequest):
    # Проверка URL
    if "music.yandex." not in req.url:
        raise HTTPException(400, detail="Только ссылки Яндекс.Музыки")

    # Создаем временную директорию
    temp_dir = tempfile.mkdtemp()
    try:
        # Получаем метаданные
        artist, title = get_metadata(req.url, req.cookies)
        
        # Формируем имя файла без дублирования
        safe_filename = sanitize_filename(f"{artist} - {title}.mp3")
        output_path = os.path.join(temp_dir, safe_filename)
        
        # Для заголовка используем кодированное имя
        encoded_filename = urllib.parse.quote(safe_filename)
        
        logger.info(f"Starting download: {safe_filename}")
        
        # Команда для скачивания и конвертации
        cmd = [
            "yt-dlp",
            "-x",  # Извлечь аудио
            "--audio-format", "mp3",
            "--audio-quality", "192K",
            "-o", output_path,
        ]
        
        # Обработка cookies
        cookies_path = None
        if req.cookies:
            cookies_path = "cookies.txt"
            with open(cookies_path, "w", encoding="utf-8") as f:
                f.write(convert_to_netscape_format(req.cookies))
            cmd += ["--cookies", cookies_path]
        
        cmd.append(req.url)
        
        # Запускаем процесс и ждем завершения
        logger.info(f"Running command: {' '.join(cmd)}")
        process = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True
        )
        
        # Убедимся, что файл полностью записан
        max_attempts = 10
        file_ready = False
        for i in range(max_attempts):
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                file_size = os.path.getsize(output_path)
                logger.info(f"File found: {output_path}, size: {file_size} bytes")
                file_ready = True
                break
            logger.info(f"Waiting for file... (attempt {i+1}/{max_attempts})")
            time.sleep(0.5)
        
        if not file_ready:
            raise Exception("Файл не был создан или пуст")

        # Читаем файл в память
        with open(output_path, 'rb') as f:
            content = f.read()
        
        # Проверяем длительность файла
        if len(content) < 1_000_000:  # Если файл меньше 1MB - вероятно превью
            logger.warning(f"Small file size detected: {len(content)} bytes. May be a preview version.")
            if req.cookies:
                logger.warning("Cookies provided but still got small file. Check cookies validity.")
        
        return StreamingResponse(
            iter([content]),
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": f"attachment; filename=\"{encoded_filename}\"",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )

    except subprocess.CalledProcessError as e:
        error_msg = f"yt-dlp error: {e.stderr.decode('utf-8') if e.stderr else str(e)}"
        logger.error(error_msg)
        raise HTTPException(500, detail=error_msg)
    except Exception as e:
        logger.error(f"General error: {str(e)}")
        raise HTTPException(500, detail=f"Ошибка: {str(e)}")
    finally:
        # Удаляем временный файл cookies
        if req.cookies and os.path.exists("cookies.txt"):
            os.remove("cookies.txt")
        
        # Очистка временных файлов
        if os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
                logger.info(f"Temporary directory removed: {temp_dir}")
            except Exception as e:
                logger.warning(f"Error removing directory {temp_dir}: {str(e)}")