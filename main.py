from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import yt_dlp
import subprocess
import shlex
import requests

app = FastAPI(title="YouTube Downloader API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def stream_ytdlp(url: str, resolution: str):
    ydl_opts = {
        'format': f'bestvideo[height<={resolution}]+bestaudio/best',
        'quiet': True,
        'no_warnings': True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        stream_url = info['url']
    return stream_url

@app.post("/download/")
async def download(url: str, resolution: int = 720, format: str = 'mp4'):
    if format not in ('mp4', 'mp3'):
        raise HTTPException(status_code=400, detail="Unsupported format")
    try:
        direct_url = stream_ytdlp(url, str(resolution))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error extracting video: {e}")

    if format == 'mp4':
        return StreamingResponse(
            requests.get(direct_url, stream=True).iter_content(chunk_size=8192),
            media_type="video/mp4",
            headers={"Content-Disposition": f'attachment; filename="video_{resolution}p.mp4"'}
        )
    else:
        cmd = f'ffmpeg -i "{direct_url}" -vn -f mp3 pipe:1'
        process = subprocess.Popen(shlex.split(cmd), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        return StreamingResponse(
            process.stdout,
            media_type="audio/mpeg",
            headers={"Content-Disposition": 'attachment; filename="audio.mp3"'}
        )
