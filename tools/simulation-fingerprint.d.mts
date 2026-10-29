export function simulationFingerprint(
  root?: string,
  configuration?: Record<string, unknown>,
): Promise<{
  commit: string;
  dirty: boolean;
  sourceFiles: string[];
  sourceSha256: string;
  configuration: Record<string, unknown>;
  configSha256: string;
}>;
