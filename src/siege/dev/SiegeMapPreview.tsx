import RenderScenePreview from './RenderScenePreview';
import { RENDER_SCENES, type RenderSceneName } from './renderScenes';

export default function SiegeMapPreview() {
  const scene = new URLSearchParams(window.location.search).get('scene');
  return (
    <RenderScenePreview
      name={RENDER_SCENES.includes(scene as RenderSceneName) ? (scene as RenderSceneName) : 'board'}
    />
  );
}
