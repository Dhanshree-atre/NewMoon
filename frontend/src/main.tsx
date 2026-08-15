import React from 'react';
import { createRoot } from 'react-dom/client';
import { AirdropProvider } from './contexts/AirdropContext.js';
import { App } from './App.js';
import './globals.js';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root not found');

createRoot(container).render(
  <React.StrictMode>
    <AirdropProvider>
      <App />
    </AirdropProvider>
  </React.StrictMode>,
);
