import { useState } from 'react'
import axios from 'axios'

function App() {
  const [url, setUrl] = useState('')
  const [resolution, setResolution] = useState('720')
  const [format, setFormat] = useState('mp4')
  const [progress, setProgress] = useState(0)
  const [loading, setLoading] = useState(false)

  const handleDownload = async (e) => {
    e.preventDefault()
    if (!url) return

    setLoading(true)
    setProgress(0)

    try {
      const response = await axios.post(
        'http://localhost:8000/download/',
        { url, resolution: parseInt(resolution), format },
        {
          responseType: 'blob',
          onDownloadProgress: (ev) => {
            if (ev.total) {
              setProgress(Math.round((ev.loaded * 100) / ev.total))
            }
          }
        }
      )

      const blob = new Blob([response.data], { type: response.data.type })
      const link = document.createElement('a')
      const filename = response.headers['content-disposition']
        ?.split('filename=')[1]
        ?.replace(/"/g, '') || `video.${format}`

      link.href = URL.createObjectURL(blob)
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      console.error(err)
      alert('Ошибка при скачивании. Проверь URL или настройки бэка.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-md-6">
          <div className="card shadow-sm">
            <div className="card-body">
              <h1 className="card-title mb-4 text-center">YouTube Downloader</h1>
              <form onSubmit={handleDownload}>
                <div className="mb-3">
                  <label className="form-label">Ссылка на видео</label>
                  <input
                    type="url"
                    className="form-control"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://youtu.be/..."
                    required
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Разрешение</label>
                  <select
                    className="form-select"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                  >
                    <option value="240">240p</option>
                    <option value="360">360p</option>
                    <option value="480">480p</option>
                    <option value="720">720p</option>
                    <option value="1080">1080p</option>
                  </select>
                </div>

                <fieldset className="mb-4">
                  <legend className="col-form-label">Формат</legend>
                  <div className="form-check form-check-inline">
                    <input
                      className="form-check-input"
                      type="radio"
                      name="format"
                      id="fmtMp4"
                      value="mp4"
                      checked={format === 'mp4'}
                      onChange={() => setFormat('mp4')}
                    />
                    <label className="form-check-label" htmlFor="fmtMp4">
                      MP4
                    </label>
                  </div>
                  <div className="form-check form-check-inline">
                    <input
                      className="form-check-input"
                      type="radio"
                      name="format"
                      id="fmtMp3"
                      value="mp3"
                      checked={format === 'mp3'}
                      onChange={() => setFormat('mp3')}
                    />
                    <label className="form-check-label" htmlFor="fmtMp3">
                      MP3
                    </label>
                  </div>
                </fieldset>

                <button
                  type="submit"
                  className="btn btn-primary w-100"
                  disabled={loading}
                >
                  {loading ? 'Скачиваем...' : 'Скачать'}
                </button>

                {loading && (
                  <div className="mt-4">
                    <div className="progress">
                      <div
                        className="progress-bar"
                        role="progressbar"
                        style={{ width: `${progress}%` }}
                        aria-valuenow={progress}
                        aria-valuemin="0"
                        aria-valuemax="100"
                      >
                        {progress}%
                      </div>
                    </div>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
