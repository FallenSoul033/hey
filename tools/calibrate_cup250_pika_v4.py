#!/usr/bin/env python3
"""Deterministically calibrate the Task #64 Pika v4 clip to 24 Cup250 angles."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from pathlib import Path

import cv2
import numpy as np


EXPECTED_SOURCE_BYTES = 292_034
EXPECTED_SOURCE_SHA256 = "D44A5CF5939015D97D01D32A4F108BEC99F80312C0D192E3C8334340E13C8FD7"
REFERENCE_COUNT = 24
ANALYSIS_SIZE = 256


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def decode_video(path: Path) -> tuple[list[np.ndarray], float, int, int]:
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise RuntimeError(f"OpenCV could not open source video: {path}")
    fps = float(capture.get(cv2.CAP_PROP_FPS))
    width = int(round(capture.get(cv2.CAP_PROP_FRAME_WIDTH)))
    height = int(round(capture.get(cv2.CAP_PROP_FRAME_HEIGHT)))
    frames: list[np.ndarray] = []
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        frames.append(frame)
    capture.release()
    if not frames or fps <= 0:
        raise RuntimeError("Source video has no decodable frames or a non-positive frame rate")
    return frames, fps, width, height


def load_references(directory: Path) -> list[np.ndarray]:
    frames: list[np.ndarray] = []
    for number in range(1, REFERENCE_COUNT + 1):
        path = directory / f"frame-{number:02d}.webp"
        frame = cv2.imread(str(path), cv2.IMREAD_COLOR)
        if frame is None:
            raise RuntimeError(f"Missing or unreadable approved reference: {path}")
        frames.append(frame)
    return frames


def perceptual_hash(gray: np.ndarray) -> np.ndarray:
    compact = cv2.resize(gray, (32, 32), interpolation=cv2.INTER_AREA)
    dct = cv2.dct(np.float32(compact))[:8, :8]
    threshold = float(np.median(dct[1:, :]))
    return dct > threshold


def foreground_geometry(frame: np.ndarray) -> tuple[float, float, float, float]:
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    mask = np.where((hsv[:, :, 1] > 28) | (gray < 222), 255, 0).astype(np.uint8)
    margin_x = max(1, frame.shape[1] // 20)
    margin_y = max(1, frame.shape[0] // 20)
    mask[:margin_y, :] = 0
    mask[-margin_y:, :] = 0
    mask[:, :margin_x] = 0
    mask[:, -margin_x:] = 0
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
    candidates: list[tuple[float, int]] = []
    image_center = np.array([frame.shape[1] / 2, frame.shape[0] / 2])
    for label in range(1, count):
        area = int(stats[label, cv2.CC_STAT_AREA])
        if area < frame.size * 0.002:
            continue
        distance = float(np.linalg.norm(centroids[label] - image_center))
        candidates.append((area / (1.0 + distance / max(frame.shape[:2])), label))
    if not candidates:
        raise RuntimeError("Could not segment Cup250 foreground for drift measurement")
    label = max(candidates)[1]
    x, y, width, height, _ = stats[label]
    center_x, center_y = centroids[label]
    return float(center_x), float(center_y), float(width), float(height)


def object_crop(frame: np.ndarray) -> np.ndarray:
    center_x, center_y, width, height = foreground_geometry(frame)
    side = max(width, height) * 1.12
    half = side / 2.0
    left = int(math.floor(center_x - half))
    top = int(math.floor(center_y - half))
    right = int(math.ceil(center_x + half))
    bottom = int(math.ceil(center_y + half))
    pad_left = max(0, -left)
    pad_top = max(0, -top)
    pad_right = max(0, right - frame.shape[1])
    pad_bottom = max(0, bottom - frame.shape[0])
    left = max(0, left)
    top = max(0, top)
    right = min(frame.shape[1], right)
    bottom = min(frame.shape[0], bottom)
    crop = frame[top:bottom, left:right]
    if any((pad_left, pad_top, pad_right, pad_bottom)):
        border = np.median(np.concatenate((frame[:8].reshape(-1, 3), frame[-8:].reshape(-1, 3))), axis=0)
        crop = cv2.copyMakeBorder(
            crop,
            pad_top,
            pad_bottom,
            pad_left,
            pad_right,
            cv2.BORDER_CONSTANT,
            value=tuple(float(value) for value in border),
        )
    return crop


def feature_record(frame: np.ndarray, orb: cv2.ORB) -> dict[str, object]:
    small = cv2.resize(object_crop(frame), (ANALYSIS_SIZE, ANALYSIS_SIZE), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    normalized = cv2.equalizeHist(gray)
    edges = cv2.Canny(normalized, 45, 135)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    histogram = cv2.calcHist([hsv], [0, 1], None, [24, 16], [0, 180, 0, 256])
    cv2.normalize(histogram, histogram)
    _, descriptors = orb.detectAndCompute(normalized, None)
    zgray = normalized.astype(np.float32)
    zgray = (zgray - float(zgray.mean())) / max(float(zgray.std()), 1.0)
    return {
        "gray": zgray,
        "edges": edges.astype(np.float32) / 255.0,
        "histogram": histogram,
        "hash": perceptual_hash(gray),
        "descriptors": descriptors,
    }


def feature_cost(left: dict[str, object], right: dict[str, object], matcher: cv2.BFMatcher) -> float:
    hash_cost = float(np.mean(np.not_equal(left["hash"], right["hash"])))
    edge_cost = float(np.mean(np.abs(left["edges"] - right["edges"])))
    gray_cost = min(1.0, float(np.mean(np.abs(left["gray"] - right["gray"]))) / 2.5)
    histogram_cost = float(cv2.compareHist(left["histogram"], right["histogram"], cv2.HISTCMP_BHATTACHARYYA))
    descriptors_left = left["descriptors"]
    descriptors_right = right["descriptors"]
    orb_cost = 1.0
    if descriptors_left is not None and descriptors_right is not None and len(descriptors_left) >= 2 and len(descriptors_right) >= 2:
        pairs = matcher.knnMatch(descriptors_left, descriptors_right, k=2)
        good = sum(1 for pair in pairs if len(pair) == 2 and pair[0].distance < 0.76 * pair[1].distance)
        orb_score = min(1.0, good / max(12.0, min(len(descriptors_left), len(descriptors_right)) * 0.22))
        orb_cost = 1.0 - orb_score
    return (0.34 * hash_cost) + (0.25 * edge_cost) + (0.16 * gray_cost) + (0.15 * histogram_cost) + (0.10 * orb_cost)


def global_ssim(left: np.ndarray, right: np.ndarray) -> float:
    left_gray = cv2.cvtColor(cv2.resize(left, (ANALYSIS_SIZE, ANALYSIS_SIZE)), cv2.COLOR_BGR2GRAY).astype(np.float64)
    right_gray = cv2.cvtColor(cv2.resize(right, (ANALYSIS_SIZE, ANALYSIS_SIZE)), cv2.COLOR_BGR2GRAY).astype(np.float64)
    mean_left = float(left_gray.mean())
    mean_right = float(right_gray.mean())
    variance_left = float(left_gray.var())
    variance_right = float(right_gray.var())
    covariance = float(np.mean((left_gray - mean_left) * (right_gray - mean_right)))
    c1 = (0.01 * 255) ** 2
    c2 = (0.03 * 255) ** 2
    return ((2 * mean_left * mean_right + c1) * (2 * covariance + c2)) / (
        (mean_left**2 + mean_right**2 + c1) * (variance_left + variance_right + c2)
    )


def align_direction(
    cost_matrix: np.ndarray,
    video_features: list[dict[str, object]],
    matcher: cv2.BFMatcher,
    reference_order: list[int],
) -> dict[str, object]:
    frame_count = cost_matrix.shape[0]
    sequence = reference_order + [reference_order[0]]
    expected_step = (frame_count - 1) / REFERENCE_COUNT
    start_limit = min(24, max(1, frame_count // 5))
    end_floor = max(0, frame_count - start_limit - 1)
    best: dict[str, object] | None = None

    for fixed_start in range(start_limit + 1):
        dp = np.full((len(sequence), frame_count), np.inf, dtype=np.float64)
        previous = np.full((len(sequence), frame_count), -1, dtype=np.int16)
        dp[0, fixed_start] = float(cost_matrix[fixed_start, sequence[0]])
        for anchor in range(1, len(sequence)):
            minimum_index = fixed_start + anchor
            maximum_index = frame_count - (len(sequence) - anchor)
            for frame_index in range(minimum_index, maximum_index + 1):
                low = max(minimum_index - 1, frame_index - 16)
                high = frame_index
                prior_indexes = np.arange(low, high, dtype=np.int32)
                if not len(prior_indexes):
                    continue
                steps = frame_index - prior_indexes
                transition = 0.018 * np.abs(steps - expected_step) / expected_step
                candidates = dp[anchor - 1, prior_indexes] + transition
                winner = int(np.argmin(candidates))
                prior_index = int(prior_indexes[winner])
                dp[anchor, frame_index] = float(candidates[winner] + cost_matrix[frame_index, sequence[anchor]])
                previous[anchor, frame_index] = prior_index

        for final_index in range(end_floor, frame_count):
            if not np.isfinite(dp[-1, final_index]) or final_index - fixed_start < int((frame_count - 1) * 0.72):
                continue
            seam_cost = feature_cost(video_features[fixed_start], video_features[final_index], matcher)
            score = float(dp[-1, final_index] + (1.8 * seam_cost))
            if best is not None and score >= float(best["score"]):
                continue
            indexes = [final_index]
            cursor = final_index
            for anchor in range(len(sequence) - 1, 0, -1):
                cursor = int(previous[anchor, cursor])
                indexes.append(cursor)
            indexes.reverse()
            best = {
                "score": score,
                "indexes": indexes,
                "sequence": sequence,
                "seamCost": seam_cost,
            }

    if best is None:
        raise RuntimeError("No valid monotonic/cyclic calibration path was found")
    return best


def percentile(values: np.ndarray, quantile: float) -> float:
    return float(np.percentile(values, quantile))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--references", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--matrix", required=True, type=Path)
    args = parser.parse_args()

    source = args.source.resolve()
    size = source.stat().st_size
    digest = sha256_file(source)
    if size != EXPECTED_SOURCE_BYTES or digest != EXPECTED_SOURCE_SHA256:
        raise RuntimeError(f"Exact source identity mismatch: bytes={size}, sha256={digest}")

    cv2.setRNGSeed(64)
    source_frames, fps, width, height = decode_video(source)
    references = load_references(args.references.resolve())
    orb = cv2.ORB_create(nfeatures=650, scaleFactor=1.2, nlevels=8, edgeThreshold=19, fastThreshold=10)
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    source_features = [feature_record(frame, orb) for frame in source_frames]
    reference_features = [feature_record(frame, orb) for frame in references]
    cost_matrix = np.empty((len(source_frames), len(references)), dtype=np.float64)
    for frame_index, source_feature in enumerate(source_features):
        for reference_index, reference_feature in enumerate(reference_features):
            cost_matrix[frame_index, reference_index] = feature_cost(source_feature, reference_feature, matcher)

    forward = align_direction(cost_matrix, source_features, matcher, list(range(REFERENCE_COUNT)))
    reverse = align_direction(cost_matrix, source_features, matcher, [0] + list(range(REFERENCE_COUNT - 1, 0, -1)))
    selected_direction = "forward" if float(forward["score"]) <= float(reverse["score"]) else "reverse"
    selected = forward if selected_direction == "forward" else reverse
    start_frame = int(selected["indexes"][0])
    end_frame = int(selected["indexes"][-1])

    source_anchor_by_reference: dict[int, tuple[int, float]] = {}
    for reference_index, frame_index in zip(selected["sequence"][:-1], selected["indexes"][:-1]):
        source_anchor_by_reference[int(reference_index)] = (int(frame_index), float(cost_matrix[frame_index, reference_index]))
    final_source_frame = int(selected["indexes"][-1])
    final_source_cost = float(cost_matrix[final_source_frame, 0])
    anchors: list[dict[str, object]] = []
    for reference_index in range(REFERENCE_COUNT):
        source_frame, match_cost = source_anchor_by_reference[reference_index]
        derivative_frame = source_frame - start_frame if selected_direction == "forward" else end_frame - source_frame
        anchors.append({
            "angle": reference_index * 15,
            "reference": f"frame-{reference_index + 1:02d}.webp",
            "sourceFrame": source_frame,
            "sourceTime": round(source_frame / fps, 6),
            "derivativeFrame": derivative_frame,
            "derivativeTime": round(derivative_frame / fps, 6),
            "matchCost": round(match_cost, 6),
        })
    final_derivative_frame = end_frame - start_frame
    anchors.append({
        "angle": 360,
        "reference": "frame-01.webp",
        "sourceFrame": final_source_frame if selected_direction == "forward" else start_frame,
        "sourceTime": round((final_source_frame if selected_direction == "forward" else start_frame) / fps, 6),
        "derivativeFrame": final_derivative_frame,
        "derivativeTime": round(final_derivative_frame / fps, 6),
        "matchCost": round(final_source_cost if selected_direction == "forward" else float(cost_matrix[start_frame, 0]), 6),
    })
    anchors.sort(key=lambda anchor: int(anchor["angle"]))

    geometry = np.asarray([foreground_geometry(frame) for frame in source_frames], dtype=np.float64)
    centers = geometry[:, :2]
    median_center = np.median(centers, axis=0)
    center_offsets = np.linalg.norm(centers - median_center, axis=1)
    heights = geometry[:, 3]
    median_height = float(np.median(heights))
    height_drift = np.abs(heights - median_height) / max(median_height, 1.0) * 100.0
    stabilization_needed = percentile(center_offsets, 95) > 5.0 or percentile(height_drift, 95) > 3.0

    matrix_digest = hashlib.sha256(np.asarray(cost_matrix, dtype="<f4").tobytes()).hexdigest().upper()
    independent_indexes = np.argmin(cost_matrix, axis=0)
    monotonic_violations = int(np.sum(np.diff(independent_indexes) <= 0))
    seam_start = source_frames[start_frame]
    seam_end = source_frames[end_frame]
    seam_hash_distance = int(np.count_nonzero(perceptual_hash(cv2.cvtColor(seam_start, cv2.COLOR_BGR2GRAY)) != perceptual_hash(cv2.cvtColor(seam_end, cv2.COLOR_BGR2GRAY))))

    result = {
        "schemaVersion": 1,
        "task": 64,
        "source": {
            "fileName": source.name,
            "bytes": size,
            "sha256": digest,
            "classification": "AI_GENERATED_FROM_APPROVED_CUP250_REFERENCES",
            "codecExpected": "H.264 High / yuv420p",
            "width": width,
            "height": height,
            "fps": fps,
            "frames": len(source_frames),
            "duration": round(len(source_frames) / fps, 6),
        },
        "calibration": {
            "method": "deterministic OpenCV pHash + edges + normalized luminance + HSV histogram + ORB; constrained cyclic monotonic dynamic programming",
            "matrixShape": [int(cost_matrix.shape[0]), int(cost_matrix.shape[1])],
            "matrixFloat32Sha256": matrix_digest,
            "independentNearestMonotonicViolations": monotonic_violations,
            "selectedDirection": selected_direction,
            "forwardScore": round(float(forward["score"]), 6),
            "reverseScore": round(float(reverse["score"]), 6),
            "sourceStartFrame": start_frame,
            "sourceEndFrame": end_frame,
            "anchors": anchors,
        },
        "seam": {
            "sourceStartFrame": start_frame,
            "sourceEndFrame": end_frame,
            "globalSsim": round(global_ssim(seam_start, seam_end), 6),
            "perceptualHashDistance64": seam_hash_distance,
            "compositeCost": round(float(selected["seamCost"]), 6),
        },
        "drift": {
            "medianCenter": [round(float(value), 3) for value in median_center],
            "centerOffsetP95Px": round(percentile(center_offsets, 95), 3),
            "centerOffsetMaxPx": round(float(center_offsets.max()), 3),
            "medianForegroundHeightPx": round(median_height, 3),
            "heightDriftP95Percent": round(percentile(height_drift, 95), 3),
            "heightDriftMaxPercent": round(float(height_drift.max()), 3),
            "translationOnlyStabilizationNeeded": stabilization_needed,
        },
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.matrix.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    with args.matrix.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(["source_frame", "source_time_s", *[f"angle_{angle:03d}_cost" for angle in range(0, 360, 15)]])
        for frame_index, row in enumerate(cost_matrix):
            writer.writerow([frame_index, f"{frame_index / fps:.6f}", *[f"{value:.8f}" for value in row]])

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
