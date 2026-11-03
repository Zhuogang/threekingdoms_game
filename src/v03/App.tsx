import { lazy, Suspense, useEffect, useState } from 'react';
const SiegeApp = lazy(() => import('../siege/ui/SiegeApp'));
import { useGameSession } from './ui/hooks/useGameSession';
import { useCommands } from './ui/hooks/useCommands';
import { useCampaignOrders } from './ui/hooks/useCampaignOrders';
import { gameplayView } from './ui/hooks/gameplayView';
import { StartScreen } from './ui/screens/StartScreen';
import { GameShell } from './ui/screens/GameShell';
import './styles.css';
export default function V03App() {
  const [route, setRoute] = useState(() => window.location.hash);
  useEffect(() => {
    const update = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const context0 = useGameSession();
  const context1 = useCommands(context0);
  const context2 = useCampaignOrders(context1);
  const context = context2;
  if (route === '#chencang' || route === '#chencang/load')
    return (
      <Suspense fallback={null}>
        <SiegeApp
          locale={context.locale}
          setLocale={context.setLocale}
          initialLoad={route.endsWith('/load')}
          onExit={() => {
            window.location.hash = '';
          }}
        />
      </Suspense>
    );
  if (!context.state || context.showCampaignMenu) return <StartScreen context={context} />;
  return <GameShell context={gameplayView({ ...context, state: context.state })} />;
}
