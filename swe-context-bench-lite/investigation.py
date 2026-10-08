#!/usr/bin/env python3
"""Summarize visible investigation events without changing benchmark scores."""

from __future__ import annotations

import argparse
import bisect
import json
import math
import os
from collections import Counter
from pathlib import Path
from typing import Any


TOKEN_FIELDS = ("input_tokens", "cached_input_tokens", "output_tokens")
STANDARD_ARMS = (("baseline", 1), ("mentis", 2))
PILOT_ARMS = (("baseline", 100), ("mentis", 101))
COUNT_FIELDS = (
    "completed_item_count",
    "completed_command_count",
    "nonzero_completed_command_exit_count",
    "completed_command_missing_exit_code_count",
    "file_change_event_count",
    "mcp_call_count",
    "agent_message_count",
    "reasoning_count",
)


def _number(value: Any) -> int | float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def _safe_event_path(root: Path, value: Any) -> Path | None:
    if not isinstance(value, str) or not value:
        return None
    candidate = (root / value).resolve()
    event_root = (root / "codex-events").resolve()
    try:
        candidate.relative_to(event_root)
    except ValueError:
        return None
    return candidate


def _timings(root: Path, value: Any) -> tuple[str, list[int], list[int]]:
    path = _safe_event_path(root, value)
    if path is None:
        return ("unavailable" if value is None else "invalid_path", [], [])
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return "missing", [], []
    except (OSError, UnicodeError, json.JSONDecodeError):
        return "invalid", [], []
    if not isinstance(raw, list):
        return "invalid", [], []
    entries = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        offset = item.get("end_byte_offset")
        elapsed = _number(item.get("elapsed_ms"))
        if (
            isinstance(offset, int)
            and not isinstance(offset, bool)
            and elapsed is not None
            and offset >= 0
            and elapsed >= 0
        ):
            entries.append((offset, elapsed))
    entries.sort()
    return "available", [entry[0] for entry in entries], [entry[1] for entry in entries]


def _receipt_time(end_offset: int, offsets: list[int], times: list[int | float]) -> int | float | None:
    index = bisect.bisect_left(offsets, end_offset)
    return times[index] if index < len(times) else None


def _visible_text(item: dict[str, Any]) -> str | None:
    for value in (item.get("text"), item.get("content")):
        if isinstance(value, str):
            return value
        if isinstance(value, list):
            parts = [
                part["text"]
                for part in value
                if isinstance(part, dict) and isinstance(part.get("text"), str)
            ]
            if parts:
                return "\n".join(parts)
    return None


def _event_observables(
    root: Path, events_value: Any, timing_value: Any
) -> dict[str, Any]:
    event_path = _safe_event_path(root, events_value)
    timing_status, offsets, times = _timings(root, timing_value)
    metrics = {field: 0 for field in COUNT_FIELDS}
    refs: list[dict[str, Any]] = []
    if event_path is None:
        return {
            **metrics,
            "event_references": refs,
            "events_file_status": "unavailable" if events_value is None else "invalid_path",
            "timing_file_status": timing_status,
        }
    try:
        data = event_path.read_bytes()
    except FileNotFoundError:
        return {
            **metrics,
            "event_references": refs,
            "events_file_status": "missing",
            "timing_file_status": timing_status,
        }
    except OSError:
        return {
            **metrics,
            "event_references": refs,
            "events_file_status": "unreadable",
            "timing_file_status": timing_status,
        }

    seen_ids: set[str] = set()
    byte_offset = 0
    for line_number, raw_line in enumerate(data.splitlines(keepends=True), start=1):
        byte_offset += len(raw_line)
        try:
            event = json.loads(raw_line.decode("utf-8"))
        except (UnicodeError, json.JSONDecodeError):
            continue
        if not isinstance(event, dict) or event.get("type") != "item.completed":
            continue
        item = event.get("item")
        if not isinstance(item, dict):
            continue
        item_id = item.get("id")
        if item_id is not None:
            key = str(item_id)
            if key in seen_ids:
                continue
            seen_ids.add(key)
        item_type = item.get("type")
        if not isinstance(item_type, str):
            item_type = "unknown"
        metrics["completed_item_count"] += 1
        ref: dict[str, Any] = {
            "event_ref": f"line:{line_number}",
            "item_id": item_id,
            "item_type": item_type,
            "line_number": line_number,
            "ending_byte_offset": byte_offset,
            "stdout_receipt_ms": _receipt_time(byte_offset, offsets, times),
        }
        if item_type == "command_execution":
            metrics["completed_command_count"] += 1
            exit_code = item.get("exit_code")
            if isinstance(exit_code, int) and not isinstance(exit_code, bool):
                ref["exit_code"] = exit_code
                if exit_code != 0:
                    metrics["nonzero_completed_command_exit_count"] += 1
            else:
                ref["exit_code"] = None
                metrics["completed_command_missing_exit_code_count"] += 1
            command = item.get("command")
            if isinstance(command, str):
                ref["command"] = command
        elif item_type == "file_change":
            metrics["file_change_event_count"] += 1
        elif item_type == "mcp_tool_call":
            metrics["mcp_call_count"] += 1
            tool = item.get("tool", item.get("name"))
            if isinstance(tool, str):
                ref["tool"] = tool
        elif item_type == "agent_message":
            metrics["agent_message_count"] += 1
            text = _visible_text(item)
            if text is not None:
                ref["visible_text"] = text
        elif item_type == "reasoning":
            metrics["reasoning_count"] += 1
            text = _visible_text(item)
            if text is not None:
                ref["visible_text"] = text
        refs.append(ref)
    return {
        **metrics,
        "event_references": refs,
        "events_file_status": "available",
        "timing_file_status": timing_status,
    }


def _token_usage(record: dict[str, Any] | None) -> dict[str, int | float | None]:
    raw = record.get("token_usage") if record else None
    raw = raw if isinstance(raw, dict) else {}
    return {field: _number(raw.get(field)) for field in TOKEN_FIELDS}


def _attempt_observables(
    root: Path, task_id: str, arm: str, attempt: int, record: dict[str, Any] | None
) -> dict[str, Any]:
    if record is None:
        return {
            "task_id": task_id,
            "arm": arm,
            "attempt": attempt,
            "attempt_record_present": False,
            "runner_status": None,
            "exit_code": None,
            "elapsed_ms": None,
            "token_usage": _token_usage(None),
            **_event_observables(root, None, None),
        }
    elapsed = _number(record.get("elapsed_ms"))
    exit_code = record.get("exit_code")
    if not isinstance(exit_code, int) or isinstance(exit_code, bool):
        exit_code = None
    return {
        "task_id": task_id,
        "arm": arm,
        "attempt": attempt,
        "attempt_record_present": True,
        "runner_status": record.get("status") if isinstance(record.get("status"), str) else None,
        "exit_code": exit_code,
        "elapsed_ms": elapsed,
        "token_usage": _token_usage(record),
        **_event_observables(root, record.get("events_path"), record.get("event_timing_path")),
    }


def _read_records(root: Path) -> tuple[list[dict[str, Any]], list[int], str]:
    records: list[dict[str, Any]] = []
    invalid_lines: list[int] = []
    path = root / "attempts.jsonl"
    if not path.exists():
        return records, [], "missing"
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            invalid_lines.append(line_number)
            continue
        if isinstance(record, dict):
            records.append(record)
        else:
            invalid_lines.append(line_number)
    return records, invalid_lines, "available"


def _sum_by_arm(
    attempts: list[dict[str, Any]], expected_count: int
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for arm in ("baseline", "mentis"):
        rows = [row for row in attempts if row["arm"] == arm]
        recorded = [row for row in rows if row["attempt_record_present"]]
        elapsed_values = [row["elapsed_ms"] for row in recorded if row["elapsed_ms"] is not None]
        token_totals: dict[str, Any] = {}
        for field in TOKEN_FIELDS:
            values = [row["token_usage"][field] for row in recorded if row["token_usage"][field] is not None]
            token_totals[field] = {
                "known_total": sum(values) if values else None,
                "observed_attempts": len(values),
                "missing_attempts": expected_count - len(values),
            }
        observables = {field: sum(row[field] for row in rows) for field in COUNT_FIELDS}
        result[arm] = {
            "expected_attempts": expected_count,
            "recorded_attempts": len(recorded),
            "missing_attempts": expected_count - len(recorded),
            "failed_attempts": sum(row["runner_status"] == "failed" for row in recorded),
            "elapsed_ms_known_total": sum(elapsed_values) if elapsed_values else None,
            "elapsed_ms_observed_attempts": len(elapsed_values),
            "elapsed_ms_missing_attempts": expected_count - len(elapsed_values),
            "token_usage": token_totals,
            "observables": observables,
        }
    return result


def analyze_run(run_dir: str | os.PathLike[str], include_pilot: bool = False) -> dict[str, Any]:
    root = Path(run_dir).resolve()
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    target_ids = manifest.get("target_task_ids")
    if not isinstance(target_ids, list) or not all(isinstance(task_id, str) for task_id in target_ids):
        raise ValueError("manifest must contain target_task_ids")
    records, invalid_lines, attempts_status = _read_records(root)
    targets = set(target_ids)
    selected: dict[tuple[str, str, int], dict[str, Any]] = {}
    pilot_selected: dict[tuple[str, str, int], dict[str, Any]] = {}
    duplicates: Counter[tuple[str, str, int]] = Counter()
    pilot_duplicates: Counter[tuple[str, str, int]] = Counter()
    pilot_targets: set[str] = set()
    excluded = Counter()
    for record in records:
        task_id = record.get("task_id")
        arm = record.get("arm")
        attempt = record.get("attempt")
        if not isinstance(task_id, str) or task_id not in targets or record.get("role") != "target":
            excluded["non_target_records"] += 1
            continue
        if (
            isinstance(arm, str)
            and arm in {"baseline", "mentis"}
            and isinstance(attempt, int)
            and not isinstance(attempt, bool)
            and dict(PILOT_ARMS).get(arm) == attempt
        ):
            pilot_targets.add(task_id)
            if not include_pilot:
                excluded["pilot_records"] += 1
            else:
                key = (task_id, arm, attempt)
                if key in pilot_selected:
                    pilot_duplicates[key] += 1
                else:
                    pilot_selected[key] = record
            continue
        expected = dict(STANDARD_ARMS).get(arm) if isinstance(arm, str) else None
        if isinstance(attempt, bool) or not isinstance(attempt, int):
            attempt = None
        if expected is None or expected != attempt:
            excluded["nonstandard_target_attempts"] += 1
            continue
        key = (task_id, arm, attempt)
        if key in selected:
            duplicates[key] += 1
        else:
            selected[key] = record

    standard: list[dict[str, Any]] = []
    for task_id in target_ids:
        for arm, attempt in STANDARD_ARMS:
            key = (task_id, arm, attempt)
            row = _attempt_observables(root, task_id, arm, attempt, selected.get(key))
            if duplicates[key]:
                row["duplicate_attempt_records_ignored"] = duplicates[key]
            standard.append(row)

    report: dict[str, Any] = {
        "schema_version": 1,
        "run_id": manifest.get("run_id"),
        "scope": "standard-cohort",
        "selection": {"baseline_attempt": 1, "mentis_attempt": 2},
        "attempts_jsonl_status": attempts_status,
        "invalid_attempts_jsonl_lines": invalid_lines,
        "excluded_attempt_record_counts": dict(excluded),
        "attempts": standard,
        "totals": _sum_by_arm(standard, len(target_ids)),
    }
    if include_pilot:
        pilot: list[dict[str, Any]] = []
        for task_id in sorted(pilot_targets):
            for arm, attempt in PILOT_ARMS:
                pilot.append(
                    _attempt_observables(
                        root, task_id, arm, attempt, pilot_selected.get((task_id, arm, attempt))
                    )
                )
                if pilot_duplicates[(task_id, arm, attempt)]:
                    pilot[-1]["duplicate_attempt_records_ignored"] = pilot_duplicates[
                        (task_id, arm, attempt)
                    ]
        report["pilot"] = {
            "attempts": pilot,
            "totals": _sum_by_arm(pilot, len(pilot_targets)),
        }
    return report


def write_report(run_dir: str | os.PathLike[str], include_pilot: bool = False) -> Path:
    root = Path(run_dir).resolve()
    report = analyze_run(root, include_pilot=include_pilot)
    output = root / "investigation-observables.json"
    with output.open("x", encoding="utf-8") as file:
        json.dump(report, file, indent=2, ensure_ascii=False)
        file.write("\n")
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", help="run directory with manifest.json and attempts.jsonl")
    parser.add_argument("--include-pilot", action="store_true", help="include attempt 100/101 separately")
    args = parser.parse_args()
    try:
        output = write_report(args.run_dir, include_pilot=args.include_pilot)
    except FileExistsError:
        parser.error("investigation-observables.json already exists; refusing to overwrite")
    except (OSError, ValueError, json.JSONDecodeError) as error:
        parser.error(str(error))
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
