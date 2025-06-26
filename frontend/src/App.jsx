import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('yandex');
  
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Скачать');
  const [darkMode, setDarkMode] = useState(true);

  const [url, setUrl] = useState('');
  const [cookies, setCookies] = useState('');
  const [showAuthFrame, setShowAuthFrame] = useState(false);
  const [authStatus, setAuthStatus] = useState('');
  const [quality, setQuality] = useState('192');
  const [format, setFormat] = useState('mp3');
  const [eqPreset, setEqPreset] = useState('none');
  const [volume, setVolume] = useState(1.0);
  const [trimStart, setTrimStart] = useState('');
  const [trimEnd, setTrimEnd] = useState('');

  const [rutubeUrl, setRutubeUrl] = useState('');
  const [rutubeFormat, setRutubeFormat] = useState('mp4');
  const [rutubeQuality, setRutubeQuality] = useState('720p');

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
    } else {
      document.body.classList.add('light-theme');
      document.body.classList.remove('dark-theme');
    }
  }, [darkMode]);

  useEffect(() => {
    const handleMessage = (event) => {
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

  const downloadYandex = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus('Загрузка...');

    try {
      const trim = trimStart && trimEnd ? `${trimStart}-${trimEnd}` : null;
      
      if (trim && !/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(trim)) {
        throw new Error("Формат обрезки должен быть ММ:СС-ММ:СС (например: 00:15-00:30)");
      }
      
      const apiUrl = import.meta.env.VITE_API_URL + '/download/';
      
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
          timeout: 300000
        }
      );

      const contentDisposition = response.headers['content-disposition'] || '';
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      let filename = 'track.mp3';
      if (filenameMatch) {
          filename = decodeURIComponent(filenameMatch[1]);
      }

      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'audio/mpeg' });
      const downloadUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);
      }, 100);

      setStatus(`Сохранено: ${filename}`);
    } catch (err) {
      console.error("Ошибка скачивания:", err);
      
      let errorMsg = 'Ошибка';
      let detailedMsg = '';
      
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
      
      alert(`Ошибка: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const downloadRutube = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus('Загрузка...');

    try {
      if (!rutubeUrl.includes("rutube.ru")) {
        throw new Error("Пожалуйста, введите ссылку на Rutube");
      }
      
      const apiUrl = import.meta.env.VITE_API_URL + '/download_rutube/';
      
      const requestBody = {
        url: rutubeUrl,
        format: rutubeFormat,
        quality: rutubeFormat === 'mp4' ? rutubeQuality : null
      };
      
      const response = await axios.post(
        apiUrl,
        requestBody,
        {
          responseType: 'blob',
          timeout: 300000,
        }
      );

      const contentDisposition = response.headers['content-disposition'] || '';
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      let filename = rutubeFormat === 'mp4' ? 'video.mp4' : 'audio.mp3';
      if (filenameMatch) {
          filename = decodeURIComponent(filenameMatch[1]);
      }

      const blob = new Blob([response.data], { 
        type: rutubeFormat === 'mp4' 
          ? 'video/mp4' 
          : 'audio/mpeg' 
      });
      
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);
      }, 100);

      setStatus(`Сохранено: ${filename}`);
    } catch (err) {
      console.error("Ошибка скачивания:", err);
      
      let errorMsg = 'Ошибка';
      let detailedMsg = '';
      
      if (err.response) {
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
      
      alert(`Ошибка: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const AuthFrame = () => {
    const [manualCookies, setManualCookies] = useState('');
    
    const handleApplyCookies = () => {
      if (manualCookies.trim()) {
        window.postMessage({
          type: "AUTH_SUCCESS",
          cookies: manualCookies
        }, window.location.origin);
      } else {
        window.postMessage({
          type: "AUTH_FAILED",
          message: "Введите cookies вручную"
        }, window.location.origin);
      }
    };

    return (
      <div className="auth-frame-container">
        <div className="step">
          <span className="step-number">1</span>
          <strong>Авторизуйтесь на Яндекс.Музыке</strong>
          <p>Откройте <a href="https://music.yandex.ru" target="_blank" rel="noopener noreferrer">Яндекс.Музыку</a> в новой вкладке и войдите в свой аккаунт</p>
        </div>
        
        <div className="step">
          <span className="step-number">2</span>
          <strong>Скопируйте cookies</strong>
          <p>
            После авторизации:
            <ol>
              <li>Откройте инструменты разработчика (F12)</li>
              <li>Перейдите на вкладку "Application" (или "Хранилище")</li>
              <li>Выберите "Cookies" → "https://music.yandex.ru"</li>
              <li>Скопируйте значение cookies (Session_id, yandexuid и др.)</li>
            </ol>
          </p>
        </div>
        
        <div className="step">
          <span className="step-number">3</span>
          <strong>Вставьте cookies в поле ниже</strong>
          <textarea
            className="form-control mt-2"
            rows="4"
            placeholder="Session_id=...; yandexuid=..."
            value={manualCookies}
            onChange={e => setManualCookies(e.target.value)}
          />
          <button 
            className="auth-btn mt-2"
            onClick={handleApplyCookies}
          >
            Применить cookies
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      <div className="card main-card">
        <div className="card-header">
          <div className="d-flex align-items-center">
            <h3 className="app-title">Client Downloader</h3>
            <div className="theme-toggle-container">
              <button 
                className={`theme-toggle-btn ${darkMode ? 'dark' : 'light'}`}
                onClick={() => setDarkMode(!darkMode)}
                aria-label={darkMode ? "Переключить на светлую тему" : "Переключить на темную тему"}
              >
                {darkMode ? '☀️' : '🌙'}
              </button>
            </div>
          </div>
          
          <div className="tabs-container">
            <button 
              className={`tab-btn ${activeTab === 'yandex' ? 'active' : ''}`}
              onClick={() => setActiveTab('yandex')}
            >
              Яндекс.Музыка
            </button>
            <button 
              className={`tab-btn ${activeTab === 'rutube' ? 'active' : ''}`}
              onClick={() => setActiveTab('rutube')}
            >
              Rutube
            </button>
          </div>
        </div>
        
        <div className="card-body">
          {activeTab === 'yandex' ? (
            <form onSubmit={downloadYandex}>
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
          ) : (
            <form onSubmit={downloadRutube}>
              <div className="mb-3">
                <label className="form-label">Ссылка на Rutube видео</label>
                <input
                  type="url"
                  className="form-control"
                  value={rutubeUrl}
                  onChange={e => setRutubeUrl(e.target.value)}
                  placeholder="https://rutube.ru/video/..."
                  required
                />
                <div className="form-text">Пример: https://rutube.ru/video/abcdef123456/</div>
              </div>
              
              <div className="card mt-3 mb-3 settings-card">
                <div className="card-header">Настройки скачивания</div>
                <div className="card-body">
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label className="form-label">Формат</label>
                      <select 
                        className="form-select"
                        value={rutubeFormat}
                        onChange={e => setRutubeFormat(e.target.value)}
                      >
                        <option value="mp4">Видео (MP4)</option>
                        <option value="mp3">Аудио (MP3)</option>
                      </select>
                    </div>
                    
                    <div className="col-md-6 mb-3">
                      {rutubeFormat === 'mp4' && (
                        <>
                          <label className="form-label">Качество видео</label>
                          <select 
                            className="form-select"
                            value={rutubeQuality}
                            onChange={e => setRutubeQuality(e.target.value)}
                          >
                            <option value="360p">360p (SD)</option>
                            <option value="480p">480p</option>
                            <option value="720p">720p (HD)</option>
                            <option value="1080p">1080p (Full HD)</option>
                            <option value="best">Лучшее доступное</option>
                          </select>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="row">
                    <div className="col-md-12">
                      <div className="alert alert-info">
                        <i className="bi bi-info-circle me-2"></i>
                        Для скачивания с Rutube авторизация не требуется
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <button type="submit" className="btn btn-primary w-100 download-btn" disabled={loading}>
                {status}
              </button>
            </form>
          )}
        </div>
      </div>
      
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