import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Offline build input: Natural Earth ne_50m_land and ne_50m_rivers_lake_centerlines
// GeoJSON, from https://github.com/nvkelso/natural-earth-vector/tree/master/geojson.
const input = process.argv[2];
if (!input) throw new Error('Usage: node tools/build-v03-campaign-basemap.mjs <geojson-directory>');
const compiled = await build({
  entryPoints: ['src/v03/geography/campaign-map.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { projectCampaignPoint, CAMPAIGN_WORLD_BOUNDS: bounds } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`
);
const project = ([longitude, latitude]) => {
  const { x, y } = projectCampaignPoint(latitude, longitude);
  return [x, y];
};
const box = [-4, -4, bounds.width + 4, bounds.height + 4];
const coordinate = (point) => point.map((value) => Number(value.toFixed(2))).join(',');

// Clip before writing: retain only the regional geometry, including holes and islands.
function clipPolygon(ring) {
  let points = ring.map(project);
  for (const [axis, limit, direction] of [
    [0, box[0], 1],
    [0, box[2], -1],
    [1, box[1], 1],
    [1, box[3], -1],
  ]) {
    const result = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const aInside = (a[axis] - limit) * direction >= 0;
      const bInside = (b[axis] - limit) * direction >= 0;
      if (aInside) result.push(a);
      if (aInside !== bInside) {
        const t = (limit - a[axis]) / (b[axis] - a[axis]);
        result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    points = result;
    if (!points.length) break;
  }
  return points.length >= 3 ? `M${points.map(coordinate).join('L')}Z` : '';
}
function clipSegment(a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  let start = 0,
    end = 1;
  for (const [p, q] of [
    [-dx, a[0] - box[0]],
    [dx, box[2] - a[0]],
    [-dy, a[1] - box[1]],
    [dy, box[3] - a[1]],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
      else continue;
    }
    const t = q / p;
    if (p < 0) start = Math.max(start, t);
    else end = Math.min(end, t);
    if (start > end) return null;
  }
  return [
    [a[0] + dx * start, a[1] + dy * start],
    [a[0] + dx * end, a[1] + dy * end],
  ];
}
function clipLine(line) {
  const points = line.map(project);
  let path = '',
    previous;
  for (let i = 1; i < points.length; i++) {
    const clipped = clipSegment(points[i - 1], points[i]);
    if (!clipped) {
      previous = undefined;
      continue;
    }
    const [start, end] = clipped.map(coordinate);
    path += `${previous === start ? '' : `M${start}`}L${end}`;
    previous = end;
  }
  return path;
}
const land = JSON.parse(await readFile(join(input, 'ne_50m_land.json'), 'utf8'));
const rivers = JSON.parse(
  await readFile(join(input, 'ne_50m_rivers_lake_centerlines.json'), 'utf8'),
);
const landPath = land.features
  .flatMap(({ geometry }) =>
    (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).flatMap(
      (polygon) => polygon.map(clipPolygon),
    ),
  )
  .join('');
const riverPath = rivers.features
  .flatMap(({ geometry }) =>
    (geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates).map(clipLine),
  )
  .join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000">
<title>Regional physical reference for the Three Kingdoms campaign</title>
<desc>Natural Earth public-domain land and rivers. Modern physical reference, not a reconstruction of Han waterways or political borders. Generated with the game projection; routes and rules are separate.</desc>
<defs><filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".65" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter></defs>
<rect width="1600" height="1000" fill="#e0e7dd"/>
<path d="${landPath}" fill="#f2e7ce" stroke="#a59d83" stroke-width="1.3" fill-rule="evenodd"/>
<path d="${riverPath}" fill="none" stroke="#7dada9" stroke-width="1.55" opacity=".7"/>
<rect width="1600" height="1000" filter="url(#grain)" opacity=".065"/>
</svg>
`;
const output = 'public/assets/v03/maps/campaign-regional-map.svg';
await writeFile(output, svg);
console.log(
  JSON.stringify({
    output,
    bytes: Buffer.byteLength(svg),
    sha256: createHash('sha256').update(svg).digest('hex'),
  }),
);
