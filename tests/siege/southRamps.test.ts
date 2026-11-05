import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRenderScene } from '../../src/siege/dev/renderScenes';
import { patchOf } from '../../src/siege/render/assets';
import { statePatches } from '../../src/siege/render/stateArt';
import { createSiegeState } from '../../src/siege/rules/state';

const asset = 'docs/siege/chencang/art/s3-08-south-ramps';

describe('K4 south ramp repaint', () => {
  it('always composes the map-scale ramp patch before damage patches without changing state', () => {
    const state = createSiegeState(228);
    const before = structuredClone(state);
    expect(statePatches(state)).toEqual([{ id: 'ramp-south', state: 'ramp-south' }]);
    expect(state).toEqual(before);
    state.gates.south.durability = 0;
    expect(statePatches(state).slice(0, 2)).toEqual([
      { id: 'ramp-south', state: 'ramp-south' },
      { id: 'south', state: 'gate-south-broken' },
    ]);
    const patch = patchOf('ramp-south');
    expect(patch.at).toEqual([1273, 643]);
    expect(patch.size).toEqual([526, 68]);
    expect(patch.href).toContain('s3-08-south-ramps/patches/ramp-south.png');
    const png = readFileSync(`${asset}/patches/ramp-south.png`);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(patch.size);
  });

  it('retains three edits with matching request prompts, source hashes and patch registrations', () => {
    const json = (path: string) => JSON.parse(readFileSync(join(asset, path), 'utf8'));
    const sha = (path: string) =>
      createHash('sha256')
        .update(readFileSync(join(asset, path)))
        .digest('hex');
    const manifest = json('generation-manifest.json');
    const state = manifest.states[0];
    const job = json('job.json');
    const blocks = [
      ...readFileSync(`${asset}/README.md`, 'utf8').matchAll(/```text\n([\s\S]*?)\n```/g),
    ].map((match) => match[1]);
    expect(state.prompt).toBe(job.prompt);
    expect(blocks[0]).toBe(job.prompt);
    expect(state.images).toHaveLength(3);
    let hashesVerified = 0;
    for (const image of state.images) {
      const request = json(image.generator.requestLog);
      const expectedPrompt = job.states[0].attemptPrompts[image.id] ?? job.prompt;
      expect(request.prompt).toBe(expectedPrompt);
      expect(image.prompt).toBe(expectedPrompt);
      expect(blocks).toContain(expectedPrompt);
      expect(request.referenced_image_paths).toEqual([resolve(asset, image.input)]);
      expect(request.transparent_background).toBe(false);
      for (const [path, hash] of [
        [image.sourcePath, image.sourceSha256],
        [image.path, image.sha256],
        [image.patch.path, image.patch.sha256],
        [image.generator.requestLog, image.generator.requestSha256],
      ]) {
        expect(sha(path)).toBe(hash);
        hashesVerified++;
      }
      expect(image.losslessEncodingVerified).toBe(true);
      const info = json(image.patch.path.replace(/\.png$/, '.json'));
      expect(info.at).toEqual([1273, 643]);
      expect(info.size).toEqual([526, 68]);
      expect(info.chosen).toBe(image.path);
      expect(Math.max(...info.offset.map(Math.abs))).toBeLessThanOrEqual(4);
      expect(info.changeInside).toBeGreaterThan(0);
    }
    const selected = state.images.find(
      (image: { path: string }) => image.path === state.selected.path,
    )!;
    expect(sha(state.patch.path)).toBe(selected.patch.sha256);
    hashesVerified++;
    expect(hashesVerified).toBe(13);
    console.info('K4 patch integrity: 3 attempts, 3 prompt/log matches, 13 hashes verified');
  });

  it('places the screenshot subjects on both ramp cells', () => {
    const { state } = createRenderScene('ramps');
    for (const x of [21, 26])
      expect(state.units.filter((unit) => unit.x === x && unit.y === 15)).toMatchObject([
        { level: 'ground', troops: 800 },
      ]);
  });
});
