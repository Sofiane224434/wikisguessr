// main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/Authcontext.jsx';
import App from './App.jsx';
import './index.css';

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    backend: {
      loadPath: '/locales/{{lng}}/translation.json?v=20260901',
      requestOptions: { cache: 'no-store' },
    },
    load: 'languageOnly',
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en', 'es', 'ar', 'pt', 'zh', 'de', 'hi', 'ru', 'ja'],
    nonExplicitSupportedLngs: true,
    returnNull: false,
    detection: {
      order: ['localStorage', 'cookie'],
      caches: ['localStorage', 'cookie'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);