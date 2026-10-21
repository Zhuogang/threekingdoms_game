import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import V03App from './v03/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <V03App />
  </StrictMode>,
);
