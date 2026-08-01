import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { I18nProvider } from './i18n/I18nProvider';
import { ThemeProvider } from './theme/ThemeProvider';
import { applyTheme, readCachedTheme } from './theme/applyTheme';
import { routerBasenameFromViteBase } from './seo/siteUrl';
import './i18n';
import './styles/app.css';

// Cached theme before Dexie hydrates (avoids light flash for dark/honey/nocturne users)
applyTheme(readCachedTheme());

// Keep installed PWAs current after deploy (vite-plugin-pwa autoUpdate)
registerSW({ immediate: true });

const routerBasename = routerBasenameFromViteBase(import.meta.env.BASE_URL);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <BrowserRouter basename={routerBasename}>
          <App />
        </BrowserRouter>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
