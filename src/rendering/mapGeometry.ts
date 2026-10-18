/** Presentation geometry uses its own seeded generator; it never consumes game RNG. */
export const ATLAS_WIDTH = 1000;
export const ATLAS_HEIGHT = 720;
export interface Point {
  x: number;
  y: number;
}

export const LAND_OUTLINE: Point[] = [
  { x: -40, y: -40 },
  { x: 1040, y: -40 },
  { x: 1024, y: 55 },
  { x: 975, y: 82 },
  { x: 956, y: 130 },
  { x: 927, y: 151 },
  { x: 910, y: 180 },
  { x: 951, y: 202 },
  { x: 974, y: 239 },
  { x: 952, y: 256 },
  { x: 938, y: 244 },
  { x: 931, y: 273 },
  { x: 958, y: 305 },
  { x: 956, y: 352 },
  { x: 982, y: 377 },
  { x: 965, y: 405 },
  { x: 982, y: 438 },
  { x: 971, y: 470 },
  { x: 990, y: 507 },
  { x: 984, y: 538 },
  { x: 1000, y: 571 },
  { x: 984, y: 610 },
  { x: 998, y: 650 },
  { x: 955, y: 680 },
  { x: 903, y: 709 },
  { x: 848, y: 696 },
  { x: 788, y: 728 },
  { x: 687, y: 739 },
  { x: 585, y: 712 },
  { x: 491, y: 746 },
  { x: -40, y: 760 },
];

export const RIVERS = [
  // Yellow River: upper loop, then the northern plain and the Bohai coast.
  [
    92, 212, 169, 233, 218, 230, 259, 207, 300, 168, 353, 160, 398, 176, 409, 214, 409, 251, 451,
    274, 510, 279, 562, 264, 610, 279, 656, 265, 687, 255, 734, 261, 778, 255, 828, 249, 867, 259,
    902, 247, 942, 252,
  ],
  // Yangtze: western highlands through Jing and the lower river.
  [
    142, 532, 202, 554, 245, 576, 279, 592, 318, 593, 352, 597, 381, 582, 416, 579, 447, 591, 485,
    600, 516, 585, 550, 576, 585, 589, 625, 600, 666, 583, 697, 590, 737, 568, 771, 570, 807, 585,
    849, 576, 884, 593, 943, 595, 990, 610,
  ],
  [338, 349, 365, 366, 397, 386, 425, 430, 455, 467, 472, 513, 495, 552, 516, 585],
  [577, 585, 560, 610, 573, 631, 554, 659, 566, 685, 554, 711],
  [697, 590, 687, 557, 705, 525, 700, 500, 719, 474],
];

export const MOUNTAIN_RANGES = [
  { x: 89, y: 154, width: 183, count: 15, spread: 58 },
  { x: 167, y: 304, width: 195, count: 22, spread: 67 },
  { x: 184, y: 559, width: 178, count: 19, spread: 54 },
  { x: 365, y: 328, width: 160, count: 13, spread: 35 },
  { x: 487, y: 161, width: 101, count: 11, spread: 55 },
  { x: 764, y: 526, width: 59, count: 9, spread: 68 },
  { x: 454, y: 601, width: 181, count: 15, spread: 45 },
];

export const REGION_LABELS = [
  { name: 'LIANG', chinese: '涼 州', x: 140, y: 110, rotation: -0.06 },
  { name: 'YONG', chinese: '雍 州', x: 344, y: 223, rotation: 0.01 },
  { name: 'JI', chinese: '冀 州', x: 669, y: 143, rotation: 0.02 },
  { name: 'YAN', chinese: '兗 州', x: 648, y: 292, rotation: -0.04 },
  { name: 'XU', chinese: '徐 州', x: 798, y: 318, rotation: 0.04 },
  { name: 'YI', chinese: '益 州', x: 254, y: 504, rotation: -0.06 },
  { name: 'JING', chinese: '荊 州', x: 510, y: 540, rotation: 0.01 },
  { name: 'YANG', chinese: '揚 州', x: 799, y: 507, rotation: 0.05 },
];

export function decorativeRandom(seed = 1701): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function smoothLine(points: number[]): number[][] {
  const segments: number[][] = [];
  for (let i = 2; i < points.length - 2; i += 2) {
    const x = points[i] ?? 0;
    const y = points[i + 1] ?? 0;
    const endX = ((points[i + 2] ?? x) + x) / 2;
    const endY = ((points[i + 3] ?? y) + y) / 2;
    segments.push([x, y, endX, endY]);
  }
  return segments;
}

/** Local Voronoi regions give each city an understated territorial wash. */
export function influencePolygon(city: Point, cities: Point[]): Point[] {
  let polygon: Point[] = [
    { x: 40, y: 55 },
    { x: 950, y: 55 },
    { x: 950, y: 670 },
    { x: 40, y: 670 },
  ];
  for (const other of cities) {
    if (other === city) continue;
    const dx = other.x - city.x;
    const dy = other.y - city.y;
    if (dx === 0 && dy === 0) continue;
    const midpoint = { x: (city.x + other.x) / 2, y: (city.y + other.y) / 2 };
    const inside = (point: Point) => (point.x - midpoint.x) * dx + (point.y - midpoint.y) * dy <= 0;
    const next: Point[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      if (!a || !b) continue;
      const aInside = inside(a);
      const bInside = inside(b);
      if (aInside) next.push(a);
      if (aInside !== bInside) {
        const denominator = (b.x - a.x) * dx + (b.y - a.y) * dy;
        if (Math.abs(denominator) < 0.00001) continue;
        const t = ((midpoint.x - a.x) * dx + (midpoint.y - a.y) * dy) / denominator;
        next.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    polygon = next;
    if (polygon.length < 3) break;
  }
  return polygon;
}
