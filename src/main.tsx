import { createRoot } from 'react-dom/client';
import { StrictMode, lazy, Suspense } from 'react';
import V03App from './v03/App';

// Dev-only battlefield preview (`?battlefield-preview`); compiled out of production builds.
const BattlefieldPreview =
  import.meta.env.DEV && new URLSearchParams(location.search).has('battlefield-preview')
    ? lazy(() => import('./v03/dev/BattlefieldPreview'))
    : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {BattlefieldPreview ? (
      <Suspense fallback={null}>
        <BattlefieldPreview />
      </Suspense>
    ) : (
      <V03App />
    )}
  </StrictMode>,
);
