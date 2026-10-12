import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { enregistrerServiceWorker } from './lib/service-worker';
import { reparerFeuillesDeStyle } from './lib/stylesheet-recovery';

reparerFeuillesDeStyle();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

enregistrerServiceWorker();
