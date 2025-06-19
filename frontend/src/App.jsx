import { useState } from 'react';
import axios from 'axios';

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Скачать');
  const [progress, setProgress] = useState(0);
  const [cookies, setCookies] = useState('');
  
  // Настройки аудио
  const [quality, setQuality] = useState('192');
  const [format, setFormat] = useState('mp3');
  const [eqPreset, setEqPreset] = useState('none');
  const [volume, setVolume] = useState(1.0);
  const [trimStart, setTrimStart] = useState('');
  const [trimEnd, setTrimEnd] = useState('');

  const download = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus('Загрузка...');
    setProgress(0);

    try {
      // Формируем параметр обрезки
      const trim = trimStart && trimEnd ? `${trimStart}-${trimEnd}` : null;
      
      // Проверка формата обрезки
      if (trim && !/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(trim)) {
        throw new Error("Формат обрезки должен быть ММ:СС-ММ:СС (например: 00:15-00:30)");
      }
      
      // Используем переменную окружения для URL
      const apiUrl = import.meta.env.VITE_API_URL + '/download/';
      
      // Формируем тело запроса
      const requestBody = {
        url, 
        cookies: cookies || null,
        quality,
        format,
        eq_preset: eqPreset === 'none' ? null : eqPreset,
        volume: parseFloat(volume),
        trim
      };
      
      const response = await axios.post(
        apiUrl,
        requestBody,
        {
          responseType: 'blob',
          timeout: 300000,
          onDownloadProgress: progressEvent => {
            const percent = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total || 10000000)
            );
            setProgress(percent);
            setStatus(`Загрузка: ${percent}%`);
          }
        }
      );

      // Получаем имя файла из заголовков
      const contentDisposition = response.headers['content-disposition'] || '';
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      let filename = 'track.mp3';
      if (filenameMatch) {
          // Декодируем URL-кодированное имя файла
          filename = decodeURIComponent(filenameMatch[1]);
      }

      // Создаем и скачиваем файл
      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'audio/mpeg' });
      const downloadUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      
      // Очистка
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);
      }, 100);

      setStatus(`Сохранено: ${filename}`);
      setProgress(100);
    } catch (err) {
      console.error("Ошибка скачивания:", err);
      
      let errorMsg = 'Ошибка';
      let detailedMsg = '';
      
      // Обработка ошибок валидации (422)
      if (err.response?.status === 422) {
        detailedMsg = "Ошибка в параметрах запроса: ";
        if (err.response.data?.detail) {
          if (Array.isArray(err.response.data.detail)) {
            detailedMsg += err.response.data.detail.map(d => d.msg).join(', ');
          } else {
            detailedMsg += JSON.stringify(err.response.data.detail);
          }
        } else {
          detailedMsg += "Неверные параметры запроса";
        }
      } 
      // Обработка других ошибок
      else if (err.response) {
        if (err.response.data instanceof Blob) {
          try {
            const text = await err.response.data.text();
            try {
              const json = JSON.parse(text);
              detailedMsg = json.detail || text;
            } catch {
              detailedMsg = text || `Ошибка ${err.response.status}`;
            }
          } catch {
            detailedMsg = `Ошибка ${err.response.status}`;
          }
        } else {
          detailedMsg = err.response.data?.detail || `Ошибка ${err.response.status}`;
        }
      } else if (err.code === 'ECONNABORTED') {
        detailedMsg = 'Таймаут соединения';
      } else if (err.message.includes('Network')) {
        detailedMsg = 'Сетевая ошибка';
      } else {
        detailedMsg = err.message || 'Неизвестная ошибка';
      }
      
      errorMsg = detailedMsg;
      setStatus(errorMsg);
      setProgress(0);
      
      // Показываем подробное сообщение об ошибке
      alert(`Ошибка: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

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
          
          <div className="card mt-3 mb-3">
            <div className="card-header">Настройки аудио</div>
            <div className="card-body">
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Качество</label>
                  <select 
                    className="form-select"
                    value={quality}
                    onChange={e => setQuality(e.target.value)}
                  >
                    <option value="128">128 кбит/с</option>
                    <option value="192">192 кбит/с (рекомендуется)</option>
                    <option value="256">256 кбит/с</option>
                    <option value="320">320 кбит/с (максимальное)</option>
                  </select>
                </div>
                
                <div className="col-md-6 mb-3">
                  <label className="form-label">Формат</label>
                  <select 
                    className="form-select"
                    value={format}
                    onChange={e => setFormat(e.target.value)}
                  >
                    <option value="mp3">MP3 (совместимый)</option>
                    <option value="aac">AAC (лучшее качество)</option>
                    <option value="flac">FLAC (без потерь)</option>
                    <option value="opus">Opus (современный)</option>
                  </select>
                </div>
              </div>
              
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label">Эквалайзер</label>
                  <select 
                    className="form-select"
                    value={eqPreset}
                    onChange={e => setEqPreset(e.target.value)}
                  >
                    <option value="none">Без изменений</option>
                    <option value="bass_boost">Усилить басы</option>
                    <option value="treble_boost">Усилить высокие</option>
                    <option value="vocal_boost">Усилить вокал</option>
                    <option value="flat">Плоский (для студии)</option>
                  </select>
                </div>
                
                <div className="col-md-6 mb-3">
                  <label className="form-label">Громкость: {(volume * 100).toFixed(0)}%</label>
                  <input 
                    type="range" 
                    className="form-range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={volume}
                    onChange={e => setVolume(parseFloat(e.target.value))}
                  />
                </div>
              </div>
              
              <div className="row">
                <div className="col-md-12">
                  <label className="form-label">Обрезка трека (для рингтонов)</label>
                  <div className="input-group mb-3">
                    <span className="input-group-text">От</span>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="00:00"
                      value={trimStart}
                      onChange={e => setTrimStart(e.target.value)}
                      pattern="\d{1,2}:\d{2}"
                      title="Формат: ММ:СС (например: 00:15)"
                    />
                    <span className="input-group-text">До</span>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="00:30"
                      value={trimEnd}
                      onChange={e => setTrimEnd(e.target.value)}
                      pattern="\d{1,2}:\d{2}"
                      title="Формат: ММ:СС (например: 00:30)"
                    />
                    <span className="input-group-text">(ММ:СС)</span>
                  </div>
                  <div className="form-text">Оставьте пустым для полной версии трека</div>
                </div>
              </div>
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
  );
}