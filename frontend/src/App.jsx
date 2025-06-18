import { useState } from 'react'
import axios from 'axios'

export default function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Скачать')
  const [progress, setProgress] = useState(0)
  const [cookies, setCookies] = useState('')

  const download = async e => {
  e.preventDefault()
  setLoading(true)
  setStatus('Загрузка...')
  setProgress(0)

  try {
    const apiUrl = import.meta.env.VITE_API_URL + '/download/';
    
    const response = await axios.post(
      apiUrl,
      { url, cookies },
      {
        responseType: 'blob',
        timeout: 300000,
        onDownloadProgress: progressEvent => {
          const percent = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || 10000000)
          )
          setProgress(percent)
          setStatus(`Загрузка: ${percent}%`)
        }
      }
    )

      const contentDisposition = response.headers['content-disposition'] || '';
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      let filename = 'track.mp3';
      if (filenameMatch) {
          // Декодируем URL-кодированное имя файла
          filename = decodeURIComponent(filenameMatch[1]);
      }

      const blob = new Blob([response.data], { type: 'audio/mpeg' })
      const downloadUrl = URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      
      setTimeout(() => {
        document.body.removeChild(link)
        URL.revokeObjectURL(downloadUrl)
      }, 100)

      setStatus(`Сохранено: ${filename}`)
      setProgress(100)
    } catch (err) {
      let errorMsg = 'Ошибка'
      
      if (err.response) {
        if (err.response.data instanceof Blob) {
          const text = await err.response.data.text()
          try {
            const json = JSON.parse(text)
            errorMsg = json.detail || text
          } catch {
            errorMsg = text || `Ошибка ${err.response.status}`
          }
        } else {
          errorMsg = err.response.data?.detail || `Ошибка ${err.response.status}`
        }
      } else if (err.code === 'ECONNABORTED') {
        errorMsg = 'Таймаут соединения'
      } else if (err.message.includes('Network')) {
        errorMsg = 'Сетевая ошибка'
      } else {
        errorMsg = err.message || 'Неизвестная ошибка'
      }
      
      setStatus(errorMsg)
      setProgress(0)
      alert(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="d-flex justify-content-center align-items-center"
      style={{ width: '100vw', height: '100vh', background: '#f8f9fa' }}
    >
      <div className="card p-4" style={{ width: '800px', maxWidth: '95%' }}>
        <h3 className="mb-4 text-center">Yandex Music → MP3</h3>
        <form onSubmit={download}>
          <div className="mb-3">
            <label className="form-label">Ссылка на трек</label>
            <input
              type="url"
              className="form-control"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://music.yandex.ru/track/..."
              required
            />
            <div className="form-text">Пример: https://music.yandex.ru/track/12345678</div>
          </div>
          <div className="mb-3">
            <label className="form-label">Cookies (необязательно)</label>
            <textarea
              className="form-control"
              value={cookies}
              onChange={e => setCookies(e.target.value)}
              placeholder="Введите cookies для полных версий"
              rows="2"
            />
            <div className="form-text">
              Для скачивания полных версий требуется авторизация Яндекс.Музыки
            </div>
          </div>
          <button type="submit" className="btn btn-primary w-100" disabled={loading}>
            {status}
          </button>
          {loading && (
            <div className="mt-3">
              <div className="progress">
                <div 
                  className="progress-bar progress-bar-striped progress-bar-animated" 
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
  )
}