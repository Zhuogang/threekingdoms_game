import { createRoot } from 'react-dom/client';
import { StrictMode, lazy, Suspense } from 'react';
import V03App from './v03/App';

// Dev-only previews (`?battlefield-preview`, `?siege-preview`, `?siege-map`); compiled out of production builds.
const params = new URLSearchParams(location.search);
const DevPreview = !import.meta.env.DEV
  ? null
  : params.has('siege-map')
    ? lazy(() => import('./siege/dev/SiegeMapPreview'))
    : params.has('siege-preview')
      ? lazy(() => import('./siege/dev/SiegePreview'))
      : params.has('battlefield-preview')
        ? lazy(() => import('./v03/dev/BattlefieldPreview'))
        : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {DevPreview ? (
      <Suspense fallback={null}>
        <DevPreview />
      </Suspense>
    ) : (
      <V03App />
    )}
  </StrictMode>,
);
