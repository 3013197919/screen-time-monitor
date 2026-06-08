import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import i18nInstance from './i18n';
import ErrorBoundary from './components/ErrorBoundary';

// Inject i18n instance for class-based ErrorBoundary
ErrorBoundary.setI18n(i18nInstance);

const rootElement: HTMLElement | null = document.getElementById('root');

if (!rootElement) {
  throw new Error(
    'Root element not found. Make sure index.html contains <div id="root"></div>.'
  );
}

const root: ReactDOM.Root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
