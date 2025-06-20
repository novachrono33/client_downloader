import { useState, useEffect } from 'react';
import axios from 'axios';

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Скачать');
  const [progress, setProgress] = useState(0);
  const [cookies, setCookies] = useState('');
  const [darkMode, setDarkMode] = useState(true);
  
  // Настройки аудио
  const [quality, setQuality] = useState('192');
  const [format, setFormat] = useState('mp3');
  const [eqPreset, setEqPreset] = useState('none');
  const [volume, setVolume] = useState(1.0);
  const [trimStart, setTrimStart] = useState('');
  const [trimEnd, setTrimEnd] = useState('');

  // Применяем тему при загрузке
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
    } else {
      document.body.classList.add('light-theme');
      document.body.classList.remove('dark-theme');
    }
  }, [darkMode]);

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
    <div className="app-container">
      <div className="card main-card">
        <div className="card-header">
          <h3 className="mb-0">Client Downloader</h3>
          <button 
            className={`theme-toggle-btn ${darkMode ? 'dark' : 'light'}`}
            onClick={() => setDarkMode(!darkMode)}
            aria-label={darkMode ? "Переключить на светлую тему" : "Переключить на темную тему"}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
        
        <div className="card-body">
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
            
            <div className="card mt-3 mb-3 settings-card">
              <div className="card-header">Настройки аудио</div>
              <div className="card-body">
                <div className="row align-items-center"> {/* Добавлено выравнивание по центру */}
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
                
                <div className="row align-items-center"> {/* Добавлено выравнивание по центру */}
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
                      className="form-range volume-slider"
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
            
            <button type="submit" className="btn btn-primary w-100 download-btn" disabled={loading}>
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
      
      <style jsx>{`
        .app-container {
          min-height: 100vh;
          width: 100vw;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
          background-color: ${darkMode ? '#121212' : '#f8f9fa'};
          transition: background-color 0.3s ease-in-out;
          font-family: 'Inter', 'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif;
        }
        
        .main-card {
          width: 800px;
          max-width: 95%;
          background-color: ${darkMode ? '#1e1e1e' : '#fff'};
          border-color: ${darkMode ? '#333' : '#dee2e6'};
          color: ${darkMode ? '#f0f0f0' : '#212529'};
          box-shadow: ${darkMode ? '0 4px 20px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.1)'};
          border-radius: 12px;
          overflow: hidden;
          transition: all 0.3s ease-in-out;
          animation: fadeIn 0.5s ease-out;
        }
        
        .card-header {
          position: relative;
          background-color: ${darkMode ? '#2a2a2a' : '#f8f9fa'};
          border-color: ${darkMode ? '#444' : '#dee2e6'};
          color: ${darkMode ? '#fff' : '#212529'};
          padding: 1.2rem 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .theme-toggle-btn {
          background: ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
          border: none;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s ease;
          font-size: 1.2rem;
        }
        
        .theme-toggle-btn:hover {
          transform: scale(1.1);
          background: ${darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'};
        }
        
        .card-body {
          padding: 1.5rem;
        }
        
        .settings-card {
          background-color: ${darkMode ? '#252525' : '#f8f9fa'};
          border-color: ${darkMode ? '#444' : '#dee2e6'};
          border-radius: 8px;
          transition: all 0.3s ease;
        }
        
        .settings-card:hover {
          box-shadow: ${darkMode ? '0 2px 10px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)'};
        }
        
        .form-control, .form-select, .volume-slider {
          background-color: ${darkMode ? '#2d2d2d' : '#fff'};
          color: ${darkMode ? '#f0f0f0' : '#212529'};
          border-color: ${darkMode ? '#444' : '#ced4da'};
          border-radius: 6px;
          padding: 0.75rem 1rem;
          transition: all 0.3s ease;
          max-width: 100%;
        }
        
        .form-control::placeholder {
          color: ${darkMode ? '#888' : '#6c757d'} !important;
        }
        
        .form-select {
          appearance: none;
          background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='${darkMode ? '%23f0f0f0' : '%23212529'}' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M2 5l6 6 6-6'/%3e%3c/svg%3e");
          background-repeat: no-repeat;
          background-position: right 0.75rem center;
          background-size: 16px 12px;
        }
        
        .form-control:focus, .form-select:focus, .volume-slider:focus {
          background-color: ${darkMode ? '#2d2d2d' : '#fff'};
          color: ${darkMode ? '#fff' : '#212529'};
          border-color: ${darkMode ? '#666' : '#86b7fe'};
          box-shadow: ${darkMode ? '0 0 0 0.25rem rgba(100, 100, 100, 0.25)' : '0 0 0 0.25rem rgba(13, 110, 253, 0.25)'};
          outline: none;
        }
        
        .form-text {
          color: ${darkMode ? '#aaa' : '#6c757d'} !important;
          font-size: 0.85rem;
          margin-top: 0.25rem;
        }
        
        .form-label {
          font-weight: 500;
          margin-bottom: 0.5rem;
          color: ${darkMode ? '#e0e0e0' : '#495057'};
        }
        
        .input-group-text {
          background-color: ${darkMode ? '#333' : '#e9ecef'};
          color: ${darkMode ? '#e0e0e0' : '#495057'};
          border-color: ${darkMode ? '#444' : '#ced4da'};
        }
        
        .download-btn {
          background-color: ${darkMode ? '#0d6efd' : '#0d6efd'};
          border-color: ${darkMode ? '#0a58ca' : '#0a58ca'};
          padding: 0.75rem;
          font-weight: 600;
          border-radius: 8px;
          transition: all 0.3s ease;
          transform: translateY(0);
          box-shadow: ${darkMode ? '0 4px 6px rgba(0,0,0,0.2)' : '0 4px 6px rgba(0,0,0,0.1)'};
        }
        
        .download-btn:hover {
          background-color: ${darkMode ? '#0b5ed7' : '#0b5ed7'};
          border-color: ${darkMode ? '#0a58ca' : '#0a58ca'};
          transform: translateY(-2px);
          box-shadow: ${darkMode ? '0 6px 8px rgba(0,0,0,0.3)' : '0 6px 8px rgba(0,0,0,0.15)'};
        }
        
        .download-btn:disabled {
          opacity: 0.7;
          transform: none;
          box-shadow: none;
        }
        
        .download-btn:active {
          transform: translateY(0);
        }
        
        .progress {
          background-color: ${darkMode ? '#2d2d2d' : '#e9ecef'};
          height: 1.5rem;
          border-radius: 8px;
          overflow: hidden;
          margin-top: 1rem;
          animation: fadeIn 0.3s ease-out;
        }
        
        .progress-bar {
          transition: width 0.3s ease-out;
        }
        
        /* Стили для ползунка громкости */
        .volume-slider {
          width: 100%;
          padding: 0.5rem 0; /* Увеличиваем отступы по вертикали для выравнивания */
        }
        
        /* Стилизация ползунка для разных браузеров */
        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: ${darkMode ? '#0d6efd' : '#0d6efd'};
          cursor: pointer;
        }
        
        .volume-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: ${darkMode ? '#0d6efd' : '#0d6efd'};
          cursor: pointer;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}