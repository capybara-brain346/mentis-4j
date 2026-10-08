import json
import tempfile
import unittest
from pathlib import Path

from investigation import analyze_run, write_report


class InvestigationAnalysisTests(unittest.TestCase):
    def test_scopes_attempts_deduplicates_events_and_maps_utf8_receipt_offsets(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            (root / "manifest.json").write_text(
                json.dumps({"run_id": "fixture", "target_task_ids": ["target-a", "target-b"]}),
                encoding="utf-8",
            )
            event_dir = root / "codex-events" / "target-a"
            event_dir.mkdir(parents=True)
            event_path = event_dir / "attempt-0001.jsonl"
            events = [
                {"type": "item.started", "item": {"id": "ignored", "type": "command_execution"}},
                {"type": "item.completed", "item": {"id": "msg-1", "type": "agent_message", "text": "Observed café."}},
                {"type": "item.completed", "item": {"id": "cmd-1", "type": "command_execution", "command": "pytest -q", "exit_code": 2}},
                {"type": "item.completed", "item": {"id": "cmd-1", "type": "command_execution", "command": "pytest -q", "exit_code": 0}},
                {"type": "item.completed", "item": {"id": "file-1", "type": "file_change", "changes": [{"path": "src.py"}]}},
                {"type": "item.completed", "item": {"id": "mcp-1", "type": "mcp_tool_call", "tool": "search"}},
                {"type": "item.completed", "item": {"id": "reason-1", "type": "reasoning", "text": "The visible trace says this."}},
                {"type": "turn.completed", "usage": {"input_tokens": 999}},
            ]
            lines = [(json.dumps(event, ensure_ascii=False) + "\n").encode("utf-8") for event in events]
            event_path.write_bytes(b"".join(lines))
            message_end = sum(len(line) for line in lines[:2])
            command_end = sum(len(line) for line in lines[:3])
            timing_path = Path(str(event_path) + ".timing.json")
            timing_path.write_text(
                json.dumps(
                    [
                        {"end_byte_offset": message_end, "elapsed_ms": 120},
                        {"end_byte_offset": command_end, "elapsed_ms": 240},
                    ]
                ),
                encoding="utf-8",
            )

            def attempt(arm, number, events_name, timing_name, **extra):
                return {
                    "task_id": "target-a",
                    "role": "target",
                    "attempt": number,
                    "arm": arm,
                    "status": "completed",
                    "exit_code": 0,
                    "elapsed_ms": 500,
                    "events_path": events_name,
                    "event_timing_path": timing_name,
                    **extra,
                }

            records = [
                attempt(
                    "baseline",
                    1,
                    "codex-events/target-a/attempt-0001.jsonl",
                    "codex-events/target-a/attempt-0001.jsonl.timing.json",
                    token_usage={"input_tokens": 10, "cached_input_tokens": 4, "output_tokens": 2},
                ),
                attempt("mentis", 2, "codex-events/target-a/missing.jsonl", None, token_usage=None),
                attempt("baseline", 100, "codex-events/target-a/pilot.jsonl", None),
                attempt("mentis", 101, "codex-events/target-a/pilot-mentis.jsonl", None),
                {"task_id": "experience-a", "role": "experience", "attempt": 1, "arm": "experience"},
                {"task_id": "target-a", "role": "target", "arm": "invalid"},
                attempt("mentis", 100, None, None),
            ]
            (root / "attempts.jsonl").write_text(
                "\n".join(json.dumps(record) for record in records) + "\n", encoding="utf-8"
            )

            report = analyze_run(root)
            self.assertEqual(len(report["attempts"]), 4)
            self.assertEqual(report["excluded_attempt_record_counts"], {"pilot_records": 2, "non_target_records": 1, "nonstandard_target_attempts": 2})
            baseline = report["attempts"][0]
            self.assertEqual(baseline["completed_command_count"], 1)
            self.assertEqual(baseline["nonzero_completed_command_exit_count"], 1)
            self.assertEqual(baseline["file_change_event_count"], 1)
            self.assertEqual(baseline["mcp_call_count"], 1)
            self.assertEqual(baseline["agent_message_count"], 1)
            self.assertEqual(baseline["reasoning_count"], 1)
            refs = {item["item_type"]: item for item in baseline["event_references"]}
            self.assertEqual(refs["agent_message"]["visible_text"], "Observed café.")
            self.assertEqual(refs["reasoning"]["visible_text"], "The visible trace says this.")
            self.assertEqual(refs["agent_message"]["ending_byte_offset"], message_end)
            self.assertEqual(refs["agent_message"]["stdout_receipt_ms"], 120)
            self.assertEqual(refs["command_execution"]["stdout_receipt_ms"], 240)
            self.assertEqual(report["attempts"][1]["events_file_status"], "missing")
            self.assertIsNone(report["attempts"][1]["token_usage"]["input_tokens"])
            self.assertFalse(report["attempts"][2]["attempt_record_present"])
            self.assertEqual(report["totals"]["baseline"]["recorded_attempts"], 1)
            self.assertEqual(report["totals"]["baseline"]["missing_attempts"], 1)

            artifact = write_report(root, include_pilot=True)
            written = json.loads(artifact.read_text(encoding="utf-8"))
            self.assertEqual(len(written["pilot"]["attempts"]), 2)
            self.assertEqual(written["attempts"][0]["completed_command_count"], 1)
            with self.assertRaises(FileExistsError):
                write_report(root)


if __name__ == "__main__":
    unittest.main()
