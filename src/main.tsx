import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { initTheme } from './app/theme';
import { initPwa } from './app/pwa';
import { repository } from './core/storage/repository';
import { setLimits, type ImportLimits } from './config/limits';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/shell.css';

initTheme();

void repository
  .getSetting<Partial<ImportLimits>>('limits')
  .then((l) => l && setLimits(l))
  .catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

initPwa();
