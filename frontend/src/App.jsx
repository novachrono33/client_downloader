import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Скачать');
  const [progress, setProgress] = useState(0);
  const [cookies, setCookies] = useState('');
  const [darkMode, setDarkMode] = useState(true);
  const [showAuthFrame, setShowAuthFrame] = useState(false);
  const [authStatus, setAuthStatus] = useState('');
  
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

  // Обработчик сообщений от iframe авторизации
  useEffect(() => {
    const handleMessage = (event) => {
      // Проверяем origin для безопасности
      if (event.origin !== window.location.origin) return;
    
      if (event.data.type === "AUTH_SUCCESS") {
        setCookies(event.data.cookies);
        setShowAuthFrame(false);
        setAuthStatus('Авторизация успешна! Cookies получены.');
      } else if (event.data.type === "AUTH_FAILED") {
        const errorMsg = event.data.message || 'Ошибка авторизации';
        setAuthStatus(`Ошибка: ${errorMsg}. Пожалуйста, попробуйте снова.`);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

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

  const AuthFrame = () => {
    const [cookiesHeader, setCookiesHeader] = useState('');
    
    const handleApplyCookies = () => {
      if (cookiesHeader.trim()) {
        window.postMessage({
          type: "AUTH_SUCCESS",
          cookies: cookiesHeader
        }, window.location.origin);
      } else {
        window.postMessage({
          type: "AUTH_FAILED",
          message: "Введите значение заголовка Cookie"
        }, window.location.origin);
      }
    };

    const copyExample = () => {
      navigator.clipboard.writeText("Session_id=3:1662470624:5.0:1234567890|123456789.0.0.0|:0; yandexuid=1234567890123456789; yandex_login=example@yandex.ru;");
      alert("Пример скопирован в буфер обмена!");
    };

    return (
      <div className="auth-frame-container">
        <div className="step">
          <span className="step-number">1</span>
          <strong>Авторизуйтесь на Яндекс.Музыке</strong>
          <p>
            Откройте <a 
              href="https://music.yandex.ru" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary"
            >
              Яндекс.Музыку
            </a> в новой вкладке и войдите в свой аккаунт
          </p>
        </div>
        
        <div className="step">
          <span className="step-number">2</span>
          <strong>Скопируйте заголовок Cookie</strong>
          <p className="mb-1">
            После авторизации:
            <ol className="mt-1">
              <li>Откройте инструменты разработчика (F12)</li>
              <li>Перейдите на вкладку "Network" (Сеть)</li>
              <li>Обновите страницу Яндекс.Музыки (F5)</li>
              <li>Выберите любой запрос к music.yandex.ru</li>
              <li>В разделе "Headers" → "Request Headers" найдите "Cookie"</li>
              <li>Скопируйте <strong>всё</strong> значение этого заголовка</li>
            </ol>
          </p>
          <button 
            className="btn btn-sm btn-outline-secondary copy-example-btn"
            onClick={copyExample}
          >
            Скопировать пример формата
          </button>
        </div>
        
        <div className="step">
          <span className="step-number">3</span>
          <strong>Вставьте значение Cookie</strong>
          <textarea
            className="form-control mt-2"
            rows="4"
            placeholder="Session_id=...; yandexuid=...; ..."
            value={cookiesHeader}
            onChange={e => setCookiesHeader(e.target.value)}
          />
          <button 
            className="auth-btn"
            onClick={handleApplyCookies}
          >
            Применить cookies
          </button>
        </div>
        
        <div className="auth-tip">
          <strong>Совет:</strong> Для быстрого поиска:
          <ul>
            <li>Используйте поиск (Ctrl+F) по слову "Cookie"</li>
            <li>Ищите запросы к доменам: music.yandex.ru, api.music.yandex.ru</li>
            <li>Должны присутствовать ключи: Session_id, yandexuid</li>
            <li>Значение должно начинаться примерно так: Session_id=...</li>
          </ul>
        </div>
      </div>
    );
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
              <label className="form-label">
                Авторизация Яндекс.Музыки
              </label>
              
              <div className="d-flex gap-2 mb-2">
                {cookies ? (
                  <>
                    <button 
                      className="btn btn-success"
                      disabled
                    >
                      <i className="bi bi-check-circle"></i> Авторизовано
                    </button>
                    <button 
                      className="btn btn-outline-danger"
                      onClick={() => setCookies('')}
                    >
                      <i className="bi bi-x-circle"></i> Выйти
                    </button>
                  </>
                ) : (
                  <button 
                    className="btn btn-primary"
                    type="button"
                    onClick={() => setShowAuthFrame(true)}
                    disabled={showAuthFrame}
                  >
                    <i className="bi bi-music-note"></i> Авторизоваться
                  </button>
                )}
              </div>
              
              {authStatus && (
                <div className={`alert ${cookies ? 'alert-success' : 'alert-danger'}`}>
                  {authStatus}
                </div>
              )}
              
              <div className="form-text">
                Требуется для скачивания полных версий треков
              </div>
            </div>
            
            <div className="card mt-3 mb-3 settings-card">
              <div className="card-header">Настройки аудио</div>
              <div className="card-body">
                <div className="row align-items-center">
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
                
                <div className="row align-items-center">
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
          </form>
        </div>
      </div>
      
      {/* Модальное окно авторизации */}
      {showAuthFrame && (
        <div className="modal-backdrop" onClick={() => setShowAuthFrame(false)}>
          <div className="modal-container" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Авторизация в Яндекс.Музыке</h5>
                <button 
                  type="button" 
                  className="btn-close"
                  onClick={() => setShowAuthFrame(false)}
                ></button>
              </div>
              <div className="modal-body">
                <AuthFrame />
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setShowAuthFrame(false)}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}