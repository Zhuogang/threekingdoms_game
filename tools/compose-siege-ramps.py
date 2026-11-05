"""K4's 2× S3 edit job: deterministic masks, registration, map-scale patches.

Called by compose-siege-states.mjs. Never paints finished artwork: only input
guides and masked/resized pixels from the retained image_gen originals.
"""

import hashlib
import io
import json
import os
import re
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.read_bytes() != data:
        path.write_bytes(data)


def save(image, path, fmt="PNG", **options):
    output = io.BytesIO()
    image.save(output, format=fmt, **options)
    write(path, output.getvalue())


def dump(path, value):
    write(path, (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode())


def geometry(job):
    w, h = job["sourceSize"]
    cx, cy = job["crop"]
    area = Image.new("L", (w, h))
    draw = ImageDraw.Draw(area)
    for polygon in job["wedges"]:
        draw.polygon([(x - cx, y - cy) for x, y in polygon], fill=255)
    for x0, y0, x1, y1 in job["openings"]:
        draw.rectangle((x0 - cx, y0 - cy, x1 - cx - 1, y1 - cy - 1), fill=255)
    core = np.asarray(area) > 0
    distance = distance_transform_edt(~core)
    alpha = np.rint(np.clip(1 - distance / job["feather"], 0, 1) * 255).astype(np.uint8)
    return core, alpha


def check(directory, job):
    manifest = json.loads((directory / "generation-manifest.json").read_text())
    blocks = [block.split("\n```")[0] for block in (directory / "README.md").read_text().split("```text\n")[1:]]
    state = manifest["states"][0]
    assert blocks[0] == job["prompt"] == state["prompt"]
    core, alpha = geometry(job)
    ys, xs = np.nonzero(alpha)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    expected_at = [job["crop"][0] + box[0], job["crop"][1] + box[1]]
    expected_size = [box[2] - box[0], box[3] - box[1]]
    hashes = 0
    for item in state["images"]:
        source = directory / item["sourcePath"]
        candidate = directory / item["path"]
        assert sha(source) == item["sourceSha256"]
        assert sha(candidate) == item["sha256"]
        assert np.array_equal(np.asarray(Image.open(source).convert("RGB")), np.asarray(Image.open(candidate).convert("RGB")))
        request = json.loads((directory / item["generator"]["requestLog"]).read_text())
        assert sha(directory / item["generator"]["requestLog"]) == item["generator"]["requestSha256"]
        response = json.loads((directory / item["generator"]["responseLog"]).read_text())
        assert Path(re.search(r"as (/\S+\.png) by default", response["output_hint"])[1]).name == item["sourceFile"]
        expected_prompt = job["states"][0].get("attemptPrompts", {}).get(item["id"], job["prompt"])
        assert request["prompt"] == item["prompt"] == expected_prompt
        assert expected_prompt in blocks
        assert request["referenced_image_paths"] == [str((directory / job["states"][0]["input"]).resolve())]
        patch_path = directory / item["patch"]["path"]
        info = json.loads(patch_path.with_suffix(".json").read_text())
        patch = np.asarray(Image.open(patch_path))
        assert sha(patch_path) == item["patch"]["sha256"]
        assert info["at"] == expected_at and info["size"] == expected_size
        assert np.array_equal(patch[..., 3], alpha[box[1]:box[3], box[0]:box[2]])
        assert max(map(abs, info["offset"])) <= 4
        assert info["changeInside"] > 0
        preview = np.asarray(Image.open(directory / item["preview"]))
        current = np.asarray(Image.open(directory / "previews/current.png"))
        px, py, qx, qy = manifest["previewBox"]
        outside = alpha[py - job["crop"][1]:qy - job["crop"][1], px - job["crop"][0]:qx - job["crop"][0]] == 0
        assert np.array_equal(preview[outside], current[outside])
        hashes += 4
    selected = state["selected"]["path"]
    chosen = next(item for item in state["images"] if item["path"] == selected)
    assert sha(directory / state["patch"]["path"]) == chosen["patch"]["sha256"]
    map_dir = directory / "../s2-01-full-map"
    coverage = {}
    for side, rectangle in zip(["w", "e"], job["openings"]):
        ramp = np.asarray(Image.open(map_dir / f"masks/ramp-south-{side}.png").crop(rectangle)) > 127
        wall = np.asarray(Image.open(map_dir / f"masks/wall-south-{side}.png").crop(rectangle)) > 127
        parapet = np.asarray(Image.open(map_dir / f"masks/wall-south-{side}-parapet.png").crop(rectangle)) > 127
        # The inner parapet is painted into the wall body. The separate
        # parapet mask is the outer front edge and must not cover the opening.
        assert not parapet.any()
        coverage[side] = dict(pixels=int(ramp.size), rampPixels=int(ramp.sum()), wallPixels=int(wall.sum()),
                              unionPixels=int((ramp | wall).sum()), groundPixels=int((~(ramp | wall)).sum()),
                              outerParapetPixels=int(parapet.sum()))
    return dict(attempts=len(state["images"]), hashesVerified=hashes + 1,
                promptLogMatches=len(state["images"]), at=expected_at, size=expected_size,
                corePixels=int(core.sum()), featherPixels=int(((alpha > 0) & ~core).sum()),
                outsideChangedPixels=0, masksChanged=0, openingCoverage=coverage)


def compose(directory, job):
    s = job["states"][0]
    size = tuple(job["sourceSize"])
    canvas = tuple(job["canvas"])
    cx, cy = job["crop"]
    base = Image.open(directory / job["map"]).convert("RGB").crop((cx, cy, cx + size[0], cy + size[1]))
    core, alpha = geometry(job)
    # Paint-mask and overlay are input guides only. Final RGB always comes
    # from image_gen, and its alpha always comes from the same feather mask.
    mask = Image.fromarray(alpha)
    save(mask.resize(canvas, Image.Resampling.NEAREST), directory / s["blend"])
    save(Image.fromarray((alpha > 0).astype(np.uint8) * 255).resize(canvas, Image.Resampling.NEAREST), directory / s["paint"])
    overlay = Image.new("RGBA", canvas)
    draw = ImageDraw.Draw(overlay)
    sx, sy = canvas[0] / size[0], canvas[1] / size[1]
    for polygon in job["wedges"]:
        points = [((x - cx) * sx, (y - cy) * sy) for x, y in polygon]
        draw.polygon(points, fill=(222, 216, 200, 255))
        # Lines perpendicular to east-west travel, clipped to the triangle.
        x0, x1 = min(x for x, _ in polygon), max(x for x, _ in polygon)
        for x in range(x0 + 8, x1, 8):
            top = 648 + (x - x0 if polygon[0][0] == x0 else x1 - x) * 48 / 128
            draw.line(((x - cx) * sx, (top - cy) * sy, (x - cx) * sx, (696 - cy) * sy), fill=(153, 149, 138, 255), width=1)
    for x0, y0, x1, y1 in job["openings"]:
        draw.rectangle(((x0 - cx) * sx, (y0 - cy) * sy, (x1 - cx) * sx - 1, (y1 - cy) * sy - 1), fill=(222, 216, 200, 255))
    save(overlay, directory / s["overlay"])
    target = base.resize(canvas, Image.Resampling.LANCZOS).convert("RGBA")
    target.alpha_composite(overlay)
    save(target.convert("RGB"), directory / s["input"])
    source_dir = Path("attempts/s3-08/sources")
    if not all((source_dir / f"{Path(p).stem}.png").exists() for p in s["attempts"]):
        print(f"{directory.name}: input ready, awaiting three image_gen originals")
        return
    for path in s["attempts"]:
        original = source_dir / f"{Path(path).stem}.png"
        image = Image.open(original)
        assert image.size == canvas
        assert image.convert("RGBA").getextrema()[3] == (255, 255)
        save(image.convert("RGB"), directory / path, "WEBP", lossless=True, method=6)

    original = np.asarray(base).astype(float)
    # Match the existing S3 registration: luminance MAE on untouched pixels,
    # every third input pixel, searching ±8 input pixels (= ±4 map pixels).
    reference = np.asarray(base.resize(canvas, Image.Resampling.LANCZOS)).astype(float)
    lum = np.array([0.299, 0.587, 0.114])
    ref_lum = reference @ lum
    blend2 = np.asarray(mask.resize(canvas, Image.Resampling.NEAREST))
    yy, xx = np.mgrid[8:canvas[1]-8:3, 8:canvas[0]-8:3]
    keep = blend2[yy, xx] == 0
    yy, xx = yy[keep], xx[keep]
    ys, xs = np.nonzero(alpha)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    at, patch_size = [cx + x0, cy + y0], [x1 - x0, y1 - y0]
    preview_box = [max(0, x0 - 48), max(0, y0 - 48), min(size[0], x1 + 48), min(size[1], y1 + 48)]
    before = base.crop(preview_box)
    save(before, directory / "previews/current.png")
    panels = [("Current", before)]
    images = []
    for path in s["attempts"]:
        candidate_path = directory / path
        candidate = Image.open(candidate_path).convert("RGB")
        assert candidate.size == canvas
        tile = np.asarray(candidate).astype(float)
        tile_lum = tile @ lum
        cost = lambda dx, dy: float(np.abs(tile_lum[yy + dy, xx + dx] - ref_lum[yy, xx]).mean())
        still = cost(0, 0)
        best = (still, 0, 0)
        for dy in range(-8, 9):
            for dx in range(-8, 9):
                c = cost(dx, dy)
                if c < best[0]:
                    best = (c, dx, dy)
        difference, dx, dy = best
        aligned = tile[np.clip(np.arange(canvas[1]) + dy, 0, canvas[1] - 1)[:, None], np.clip(np.arange(canvas[0]) + dx, 0, canvas[0] - 1)]
        small = np.asarray(Image.fromarray(aligned.astype(np.uint8)).resize(size, Image.Resampling.LANCZOS))
        change = float(np.abs((small.astype(float) - original) @ lum)[core].mean())
        rgba = np.dstack((small, alpha))
        rgba[alpha == 0, :3] = 0
        patch = Image.fromarray(rgba).crop((x0, y0, x1, y1))
        patch_path = Path(path.replace("attempts/", "patches/").replace(".webp", ".png"))
        save(patch, directory / patch_path)
        info = dict(state=s["id"], chosen=path, at=at, size=patch_size,
                    offset=[dx, dy], difference=round(difference, 2), differenceUnshifted=round(still, 2), changeInside=round(change, 1))
        dump((directory / patch_path).with_suffix(".json"), info)
        after = base.convert("RGBA")
        after.alpha_composite(Image.fromarray(rgba))
        preview_path = f"previews/{candidate_path.stem}.png"
        preview = after.convert("RGB").crop(preview_box)
        save(preview, directory / preview_path)
        panels.append((candidate_path.stem, preview))
        source = source_dir / f"{candidate_path.stem}.png"
        request = source_dir / f"{candidate_path.stem}-request.json"
        response = source_dir / f"{candidate_path.stem}-response.json"
        if not source.exists() or not request.exists():
            raise RuntimeError(f"Missing retained image_gen original or request: {source}")
        images.append(dict(id=candidate_path.stem, type="edit", input=s["input"],
                           prompt=s.get("attemptPrompts", {}).get(candidate_path.stem, job["prompt"]),
                           generator=dict(tool="Codex built-in image_gen", requestLog=os.path.relpath(request, directory),
                                          requestSha256=sha(request), responseLog=os.path.relpath(response, directory)),
                           sourceFile=Path(re.search(r"as (/\S+\.png) by default", json.loads(response.read_text())["output_hint"])[1]).name,
                           sourcePath=os.path.relpath(source, directory),
                           sourceSha256=sha(source), path=path, bytes=candidate_path.stat().st_size, sha256=sha(candidate_path),
                           losslessEncodingVerified=bool(np.array_equal(np.asarray(Image.open(source).convert("RGB")), np.asarray(candidate))),
                           patch=dict(path=str(patch_path), sha256=sha(directory / patch_path), **{k: v for k, v in info.items() if k != "chosen"}),
                           preview=preview_path))
        if path == s["chosen"]:
            save(patch, directory / s["patch"])
            dump((directory / s["patch"]).with_suffix(".json"), info)
            save(preview, directory / "previews/ramp-south.png")
        print(f"{candidate_path.stem}: offset {dx},{dy}; difference {difference:.2f}; changeInside {change:.1f}; patch {patch_size} at {at}")
    sheet = Image.new("RGB", (before.width * len(panels), before.height + 24), (250, 248, 239))
    draw = ImageDraw.Draw(sheet)
    for index, (label, panel) in enumerate(panels):
        sheet.paste(panel, (index * before.width, 24))
        draw.text((index * before.width + 8, 6), label, fill=(45, 42, 36))
    save(sheet, directory / "previews/comparison.png")
    picked = next(item for item in images if item["path"] == s["chosen"])
    reviews = job["reviews"]
    for item in images:
        item["review"] = reviews[item["id"]]
    manifest = dict(id="s3-08", folder=directory.name, generatedOn="2026-11-04",
                    mode="Codex built-in image_gen; three independent edits of the same attached input",
                    crop=job["crop"], sourceSize=job["sourceSize"], canvas=job["canvas"], featherMapPixels=job["feather"],
                    status="provisional agent pick; awaiting planner review",
                    previewBox=[cx + preview_box[0], cy + preview_box[1], cx + preview_box[2], cy + preview_box[3]],
                    comparison="previews/comparison.png", masksChanged=False,
                    states=[dict(state=s["id"], prompt=job["prompt"], images=images,
                                 selected=dict(id=picked["id"], path=picked["path"], selectedBy="agent", provisional=True),
                                 patch=dict(picked["patch"], path=s["patch"]), preview="previews/ramp-south.png",
                                 review=reviews[picked["id"]])])
    dump(directory / "generation-manifest.json", manifest)
    print(json.dumps(check(directory, job)))


if __name__ == "__main__":
    job_path = Path(sys.argv[1])
    job = json.loads(job_path.read_text())
    if "--check" in sys.argv:
        print(json.dumps(check(job_path.parent, job)))
    else:
        compose(job_path.parent, job)
