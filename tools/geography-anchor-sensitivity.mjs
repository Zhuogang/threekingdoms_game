import { createServer } from 'vite';

const server = await createServer({
  configFile: 'vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const { C_GRADE_ANCHOR_IDS, CITY_GEOGRAPHY_BY_ID, analyzeAnchorSensitivity } =
    await server.ssrLoadModule('/src/v03/geography/index.ts');
  console.log(
    '| C-grade anchor | Adjacent edge | Baseline straight km | ±20 km anchor displacement: delta range | ±40 km anchor displacement: delta range |',
  );
  console.log('| --- | --- | ---: | ---: | ---: |');
  for (const cityId of C_GRADE_ANCHOR_IDS) {
    const name = CITY_GEOGRAPHY_BY_ID.get(cityId)?.nameEn ?? cityId;
    const at20 = new Map(
      analyzeAnchorSensitivity(cityId, 20).map((result) => [result.routeId, result]),
    );
    const at40 = new Map(
      analyzeAnchorSensitivity(cityId, 40).map((result) => [result.routeId, result]),
    );
    for (const result of at20.values()) {
      const result40 = at40.get(result.routeId);
      const range = (minimum, maximum) =>
        `${minimum > 0 ? '+' : ''}${minimum}…${maximum > 0 ? '+' : ''}${maximum}`;
      console.log(
        `| ${name} (${cityId}) | ${result.routeId} | ${result.baselineStraightLineKm} | ${range(result.minimumDeltaKm, result.maximumDeltaKm)} km | ${range(result40.minimumDeltaKm, result40.maximumDeltaKm)} km |`,
      );
    }
  }
} finally {
  await server.close();
}
