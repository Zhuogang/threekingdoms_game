import type { CampaignCityVisual } from './presentation';

export interface CampaignLabelPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Reserve both symbols and translated labels, without moving geographic city anchors. */
export function layoutCampaignCityLabels(
  cities: readonly CampaignCityVisual[],
): Map<string, CampaignLabelPlacement> {
  const occupied: CampaignLabelPlacement[] = cities.map((city) => {
    const radius = city.scale === 'imperial' ? 23 : 19;
    return {
      x: city.position.x - radius,
      y: city.position.y - radius,
      width: radius * 2,
      height: radius * 2,
    };
  });
  const intersects = (a: CampaignLabelPlacement, b: CampaignLabelPlacement) =>
    a.x < b.x + b.width + 4 &&
    a.x + a.width + 4 > b.x &&
    a.y < b.y + b.height + 4 &&
    a.y + a.height + 4 > b.y;
  const placements = new Map<string, CampaignLabelPlacement>();
  const priority = ['luoyang', 'changan', 'chenliu'];
  const order = [...cities].sort(
    (a, b) => priority.indexOf(b.id) - priority.indexOf(a.id) || a.id.localeCompare(b.id),
  );
  const angles = [Math.PI / 2, -Math.PI / 2, 0, Math.PI, -0.7, 0.7, 2.4, -2.4];
  for (const city of order) {
    const { x, y } = city.position;
    const width = Array.from(city.name).reduce(
      (sum, char) => sum + (char.codePointAt(0)! >= 0x2e80 ? 18 : 11),
      6,
    );
    const height = 22;
    let chosen: CampaignLabelPlacement | undefined;
    for (const distance of [34, 46, 60, 78, 96, 120, 150]) {
      for (const angle of angles) {
        const candidate = {
          x: x + Math.cos(angle) * distance - width / 2,
          y: y + Math.sin(angle) * distance - height / 2,
          width,
          height,
        };
        if (!occupied.some((other) => intersects(candidate, other))) {
          chosen = candidate;
          break;
        }
      }
      if (chosen) break;
    }
    chosen ??= { x: x + 24, y: y + 24, width, height };
    occupied.push(chosen);
    placements.set(city.id, chosen);
  }
  return placements;
}
