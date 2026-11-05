"""Compare two simulator JSON outputs (tools/battle-pacing.mjs or tools/v03-campaign-diagnostics.mjs).

Usage: python3 -I tools/v05-compare-sim.py <reference.json> <new.json>

Volatile fields (timestamps, timings, hashes, command lines) are ignored. Fields that exist only in
the new file are tolerated, so a tool may grow; every field of the reference must be unchanged.
Prints IDENTICAL or DIFFERENT with the first differences, and exits 1 when different.
"""
import json
import sys

IGNORE = {'generatedAt', 'wallClockMs', 'fingerprints', 'source', 'measurement', 'nodeVersion',
          'command', 'elapsedMs', 'sha256', 'engineSha256'}


def strip(value):
    if isinstance(value, dict):
        return {k: strip(v) for k, v in value.items() if k not in IGNORE}
    if isinstance(value, list):
        return [strip(v) for v in value]
    return value


def diff(a, b, path='$', out=None):
    out = [] if out is None else out
    if len(out) > 15:
        return out
    if type(a) != type(b):
        out.append(f'{path}: type {type(a).__name__} vs {type(b).__name__}')
        return out
    if isinstance(a, dict):
        for key in sorted(a):
            if key not in b:
                out.append(f'{path}.{key}: missing in new output')
            else:
                diff(a[key], b[key], f'{path}.{key}', out)
    elif isinstance(a, list):
        if len(a) != len(b):
            out.append(f'{path}: length {len(a)} vs {len(b)}')
        for i, (x, y) in enumerate(zip(a, b)):
            diff(x, y, f'{path}[{i}]', out)
    elif a != b:
        out.append(f'{path}: {str(a)[:80]} vs {str(b)[:80]}')
    return out


reference = strip(json.load(open(sys.argv[1])))
new = strip(json.load(open(sys.argv[2])))
found = diff(reference, new)
print('IDENTICAL' if not found else 'DIFFERENT\n' + '\n'.join(found))
sys.exit(1 if found else 0)
