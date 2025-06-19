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
    quality: str = "192"  # Качество по умолчанию (битрейт в кбит/с)
    format: str = "mp3"   # Формат по умолчанию
    eq_preset: str = None # Пресет эквалайзера
    volume: float = 1.0   # Уровень громкости (1.0 = 100%)
    trim: str = None      # Обрезка трека (формат "start-end")

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
    if not cookie_str:
        return ""
    
    lines = ["# Netscape HTTP Cookie File"]
    for cookie in cookie_str.split('; '):
        if '=' in cookie:
            name, value = cookie.split('=', 1)
            # Формат: domain access_flag path secure_flag expiration name value
            lines.append(f".yandex.ru\tTRUE\t/\tFALSE\t0\t{name.strip()}\t{value.strip()}")
    return "\n".join(lines)

def get_ffmpeg_args(req: DownloadRequest) -> list:
    """Генерирует аргументы FFmpeg на основе настроек"""
    args = []
    
    # Настройка громкости
    if req.volume != 1.0:
        args.extend(["-af", f"volume={req.volume}"])
    
    # Настройки эквалайзера
    eq_presets = {
        "bass_boost": "equalizer=f=100:width_type=o:width=1:g=10,equalizer=f=200:width_type=o:width=1:g=5",
        "treble_boost": "equalizer=f=3000:width_type=o:width=1:g=5,equalizer=f=10000:width_type=o:width=1:g=3",
        "vocal_boost": "equalizer=f=300:width_type=o:width=1:g=3,equalizer=f=3000:width_type=o:width=1:g=3",
        "flat": "equalizer=f=100:width_type=o:width=1:g=0"
    }
    if req.eq_preset and req.eq_preset in eq_presets:
        args.extend(["-af", eq_presets[req.eq_preset]])
    
    # Обрезка трека
    if req.trim:
        try:
            start, end = req.trim.split("-")
            args.extend(["-ss", start, "-to", end])
        except Exception:
            logger.warning(f"Invalid trim format: {req.trim}. Skipping.")
    
    return args

def get_metadata(url: str, cookies: str = None) -> tuple:
    """Получает метаданные трека через yt-dlp"""
    cmd = [
        "yt-dlp",
        "--quiet",
        "--no-warnings",
        "--skip-download",
        "--print", "%(artist)s|||%(title)s",
    ]
    
    cookies_path = None
    try:
        # Создаем временный файл для cookies
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
    except Exception as e:
        logger.error(f"Metadata error: {str(e)}")
        return ("Unknown", "Unknown")
    finally:
        # Удаляем временный файл cookies
        if cookies_path and os.path.exists(cookies_path):
            try:
                os.remove(cookies_path)
            except Exception:
                pass

@app.post("/download/")
async def download(req: DownloadRequest):
    # Проверка URL
    if "music.yandex." not in req.url:
        raise HTTPException(400, detail="Только ссылки Яндекс.Музыки")

    # Создаем временную директорию
    temp_dir = tempfile.mkdtemp()
    cookies_path = None
    try:
        # Получаем метаданные
        artist, title = get_metadata(req.url, req.cookies)
        
        # Формируем имя файла без дублирования
        safe_filename = sanitize_filename(f"{artist} - {title}.{req.format}")
        output_path = os.path.join(temp_dir, safe_filename)
        
        # Для заголовка используем кодированное имя
        encoded_filename = urllib.parse.quote(safe_filename)
        
        logger.info(f"Starting download: {safe_filename}")
        
        # Команда для скачивания и конвертации
        cmd = [
            "yt-dlp",
            "-x",  # Извлечь аудио
            "--audio-format", req.format,
            "--audio-quality", req.quality,
            "-o", output_path,
        ]
        
        # Добавляем параметры FFmpeg
        ffmpeg_args = get_ffmpeg_args(req)
        if ffmpeg_args:
            cmd.extend(["--postprocessor-args", " ".join(ffmpeg_args)])
        
        # Обработка cookies
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
        min_size = 500_000  # Минимальный размер для полного трека
        if len(content) < min_size:
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
        if cookies_path and os.path.exists(cookies_path):
            try:
                os.remove(cookies_path)
            except Exception:
                pass
        
        # Очистка временных файлов
        if os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
                logger.info(f"Temporary directory removed: {temp_dir}")
            except Exception as e:
                logger.warning(f"Error removing directory {temp_dir}: {str(e)}")