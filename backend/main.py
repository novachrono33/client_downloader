import os
import re
import subprocess
import tempfile
import time
import urllib.parse
import logging
import shutil
import json
from typing import Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, validator

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DownloadRequest(BaseModel):
    url: str
    cookies: Optional[str] = None
    quality: Optional[str] = "192"
    format: Optional[str] = "mp3"
    eq_preset: Optional[str] = None
    volume: Optional[float] = 1.0
    trim: Optional[str] = None

    @validator('volume')
    def validate_volume(cls, v):
        if v is not None and (v < 0.1 or v > 5.0):
            raise ValueError("Громкость должна быть между 0.1 и 5.0")
        return v

    @validator('quality')
    def validate_quality(cls, v):
        valid_qualities = ["64", "96", "128", "160", "192", "256", "320"]
        if v not in valid_qualities:
            raise ValueError(f"Недопустимое качество. Допустимые значения: {', '.join(valid_qualities)}")
        return v

    @validator('format')
    def validate_format(cls, v):
        valid_formats = ["mp3", "aac", "flac", "wav", "opus", "m4a"]
        if v not in valid_formats:
            raise ValueError(f"Недопустимый формат. Допустимые значения: {', '.join(valid_formats)}")
        return v

app = FastAPI()

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Обработчик ошибок валидации
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Ошибка валидации: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": [{"msg": "Ошибка валидации", "errors": exc.errors()}]},
    )

# Обработчик общих исключений
@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Необработанная ошибка: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"},
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
            parts = cookie.split('=', 1)
            if len(parts) == 2:
                name, value = parts
                # Формат: domain access_flag path secure_flag expiration name value
                lines.append(f".yandex.ru\tTRUE\t/\tFALSE\t0\t{name.strip()}\t{value.strip()}")
    return "\n".join(lines)

def get_ffmpeg_filters(req: DownloadRequest) -> str:
    """Генерирует фильтры FFmpeg на основе настроек"""
    filters = []
    
    # Настройка громкости
    if req.volume and req.volume != 1.0:
        filters.append(f"volume={req.volume}")
    
    # Настройки эквалайзера
    eq_presets = {
        "bass_boost": "equalizer=f=100:width_type=o:width=1:g=10,equalizer=f=200:width_type=o:width=1:g=5",
        "treble_boost": "equalizer=f=3000:width_type=o:width=1:g=5,equalizer=f=10000:width_type=o:width=1:g=3",
        "vocal_boost": "equalizer=f=300:width_type=o:width=1:g=3,equalizer=f=3000:width_type=o:width=1:g=3",
        "flat": "equalizer=f=100:width_type=o:width=1:g=0"
    }
    if req.eq_preset and req.eq_preset in eq_presets:
        filters.append(eq_presets[req.eq_preset])
    
    return ",".join(filters) if filters else None

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

def apply_audio_processing(input_path: str, output_path: str, req: DownloadRequest):
    """Применяет обработку звука с помощью FFmpeg"""
    ffmpeg_cmd = ["ffmpeg", "-y", "-i", input_path]
    
    # Добавляем параметры обрезки
    trim_args = []
    if req.trim:
        try:
            start, end = req.trim.split("-")
            # Проверка формата времени
            if re.match(r"^\d{1,2}:\d{2}$", start) and re.match(r"^\d{1,2}:\d{2}$", end):
                trim_args.extend(["-ss", start, "-to", end])
            else:
                logger.warning(f"Неверный формат времени для обрезки: {req.trim}")
        except Exception as e:
            logger.warning(f"Ошибка при разборе параметра обрезки: {req.trim} - {str(e)}")
    
    # Добавляем фильтры
    ffmpeg_filters = get_ffmpeg_filters(req)
    if ffmpeg_filters:
        ffmpeg_cmd.extend(["-af", ffmpeg_filters])
    
    # Определение кодека и битрейта
    codec_map = {
        "mp3": "libmp3lame",
        "aac": "aac",
        "flac": "flac",
        "wav": "pcm_s16le",
        "opus": "libopus",
        "m4a": "aac"
    }
    
    ffmpeg_cmd.extend(trim_args)
    ffmpeg_cmd.extend([
        "-c:a", codec_map.get(req.format, "libmp3lame"),
        "-b:a", f"{req.quality}k",
        output_path
    ])
    
    logger.info(f"Running FFmpeg: {' '.join(ffmpeg_cmd)}")
    result = subprocess.run(
        ffmpeg_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True
    )
    
    if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
        raise Exception("FFmpeg не создал выходной файл")

@app.post("/download/")
async def download(req: DownloadRequest):
    logger.info(f"Получен запрос на скачивание: {req.url}")
    
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
        original_path = os.path.join(temp_dir, f"original_{safe_filename}")
        output_path = os.path.join(temp_dir, safe_filename)
        
        # Для заголовка используем кодированное имя
        encoded_filename = urllib.parse.quote(safe_filename)
        
        logger.info(f"Starting download: {safe_filename}")
        
        # Команда для скачивания в максимальном качестве
        cmd = [
            "yt-dlp",
            "-x",  # Извлечь аудио
            "--audio-format", "best",  # Скачиваем в лучшем качестве
            "-o", original_path,
        ]
        
        # Обработка cookies
        if req.cookies:
            cookies_path = "cookies.txt"
            with open(cookies_path, "w", encoding="utf-8") as f:
                f.write(convert_to_netscape_format(req.cookies))
            cmd += ["--cookies", cookies_path]
        
        cmd.append(req.url)
        
        # Запускаем процесс скачивания
        logger.info(f"Running download command: {' '.join(cmd)}")
        download_process = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True
        )
        
        # Убедимся, что файл скачан
        max_attempts = 10
        file_ready = False
        for i in range(max_attempts):
            if os.path.exists(original_path) and os.path.getsize(original_path) > 0:
                file_size = os.path.getsize(original_path)
                logger.info(f"Original file found: {original_path}, size: {file_size} bytes")
                file_ready = True
                break
            logger.info(f"Waiting for original file... (attempt {i+1}/{max_attempts})")
            time.sleep(0.5)
        
        if not file_ready:
            raise Exception("Оригинальный файл не был скачан")
        
        # Применяем обработку звука
        logger.info("Applying audio processing...")
        apply_audio_processing(original_path, output_path, req)
        
        # Читаем обработанный файл
        with open(output_path, 'rb') as f:
            content = f.read()
        
        # Проверяем размер файла
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
        error_details = e.stderr.decode('utf-8') if e.stderr else str(e)
        logger.error(f"Process error: {error_details}")
        raise HTTPException(500, detail=f"Ошибка обработки: {error_details}")
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