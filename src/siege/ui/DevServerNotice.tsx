import { useEffect, useState } from 'react';
import { siegeText, type SiegeLocale } from '../i18n';

export function DevServerNotice({ locale }: { locale: SiegeLocale }) {
  const [lost, setLost] = useState(false);
  useEffect(() => {
    if (!import.meta.env.DEV || !import.meta.hot) return;
    const disconnected = () => setLost(true);
    import.meta.hot.on('vite:ws:disconnect', disconnected);
    return () => import.meta.hot?.off('vite:ws:disconnect', disconnected);
  }, []);
  return import.meta.env.DEV && lost ? (
    <div className="siege-dev-server-lost" data-testid="dev-server-lost" role="status">
      {siegeText(locale, 'devServerLost')}
    </div>
  ) : null;
}
