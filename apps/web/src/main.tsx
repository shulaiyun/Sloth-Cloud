import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import './styles/tokens.css';
import './styles/shell.css';
import './styles/console.css';
import './styles/assistant.css';
import './styles/commerce.css';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element was not found.');
}

createRoot(root).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
