#!/usr/bin/env python3
"""
周期性扫描 docs/status.md，检测「待 QA 验收」的 dev_done 任务。

重要说明（请务必读）：
  - Cursor / VS Code **没有**公开的「从 Python 调用内置 AI Agent」的 API。
  - 本脚本只能：读文件、打铃/打印、可选执行你配置的 shell 命令、可选用 `cursor` CLI 打开文件。
  - 真正的 AI 验收仍需你在 Cursor 里 @ Agent 或发「继续」。

用法示例：
  python scripts/watch_status.py
  python scripts/watch_status.py --interval 60
  python scripts/watch_status.py --open-cursor
  python scripts/watch_status.py --exec "pnpm test:e2e:build"

依赖：仅 Python 3.10+ 标准库。
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


# 与 docs/status.md §0「测试暂缓」一致：这些任务 dev_done 也不触发 QA 自动化
DEFERRED_QA_IDS: frozenset[str] = frozenset(
    {
        "T0.4",
        "T0.5",
        "T3.1",
        "T3.2",
        "T3.3",
        "T4.1",
        "T4.2",
    }
)


@dataclass
class TaskRow:
    task_id: str
    status: str
    remark: str = ""


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def parse_status_table(content: str) -> list[TaskRow]:
    """解析 status.md 中任务表格数据行（跳过表头与分隔行）。"""
    rows: list[TaskRow] = []
    for line in content.splitlines():
        line = line.rstrip()
        if not line.startswith("|"):
            continue
        if re.match(r"^\|\s*-+", line):
            continue
        if "ID" in line and "任务标题" in line:
            continue

        parts = [p.strip() for p in line.split("|")]
        # | c1 | c2 | ... |  → parts[0] 空, parts[1]=ID ...
        if len(parts) < 9:
            continue
        tid = parts[1]
        if not re.match(r"^T\d+\.\d+$", tid):
            continue
        status_raw = parts[4].strip().strip("`").strip()
        remark = parts[8] if len(parts) > 8 else ""
        rows.append(TaskRow(task_id=tid, status=status_raw, remark=remark))
    return rows


def qa_actionable_dev_done(rows: list[TaskRow]) -> list[str]:
    """返回：状态为 dev_done 且不在暂缓列表、备注里未标 QA 暂缓的任务 ID。"""
    out: list[str] = []
    for r in rows:
        if r.status != "dev_done":
            continue
        if r.task_id in DEFERRED_QA_IDS:
            continue
        if "QA 测试暂缓" in r.remark or "测试暂缓" in r.remark:
            continue
        out.append(r.task_id)
    return sorted(out)


def load_state(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_state(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def find_cursor_cli() -> str | None:
    return shutil.which("cursor") or shutil.which("cursor.cmd")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="前台轮询 docs/status.md，发现可验收的 dev_done 时提醒（可选打开 Cursor / 执行命令）"
    )
    parser.add_argument(
        "--status",
        type=Path,
        default=None,
        help="status.md 路径（默认：仓库根 docs/status.md）",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=120.0,
        help="轮询间隔（秒），默认 120",
    )
    parser.add_argument(
        "--state",
        type=Path,
        default=None,
        help="状态缓存 JSON（默认：.cache/watch_status_state.json）",
    )
    parser.add_argument(
        "--open-cursor",
        action="store_true",
        help="发现「新的」可验收 dev_done 时，尝试执行 cursor <status.md>（需 PATH 中有 cursor）",
    )
    parser.add_argument(
        "--exec",
        action="append",
        default=[],
        metavar="CMD",
        help="发现「新的」可验收 dev_done 时，在 shell 中执行的命令（可重复；工作目录为仓库根）",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="只运行一次后退出（适合 CI / cron）",
    )
    args = parser.parse_args()

    root = _project_root()
    status_path = args.status or (root / "docs" / "status.md")
    state_path = args.state or (root / ".cache" / "watch_status_state.json")

    if not status_path.is_file():
        print(f"[watch_status] 找不到文件: {status_path}", file=sys.stderr)
        return 1

    print(
        f"[watch_status] 监控: {status_path}\n"
        f"[watch_status] 间隔: {args.interval}s | once={args.once}\n"
        f"[watch_status] 说明: 无法从脚本调用 Cursor 内置 AI；仅文件监控 + 通知 + 可选命令\n",
        flush=True,
    )

    last_ids: set[str] = set(load_state(state_path).get("last_qa_dev_done_ids", []))

    while True:
        try:
            content = status_path.read_text(encoding="utf-8")
        except OSError as e:
            print(f"[watch_status] 读取失败: {e}", file=sys.stderr)
            if args.once:
                return 1
            time.sleep(args.interval)
            continue

        rows = parse_status_table(content)
        actionable = qa_actionable_dev_done(rows)
        current_set = set(actionable)

        new_ids = sorted(current_set - last_ids)
        if new_ids:
            msg = (
                "\n*** [watch_status] 发现新的可验收 dev_done 任务 ***\n"
                f"    任务: {', '.join(new_ids)}\n"
                f"    请在 Cursor 中 @ Agent 执行 QA，或运行项目约定的测试命令。\n"
            )
            print(msg, flush=True)
            # 终端响铃（Windows 终端 / 多数终端有效）
            print("\a", end="", flush=True)

            if args.open_cursor:
                exe = find_cursor_cli()
                if exe:
                    try:
                        subprocess.Popen(
                            [exe, str(status_path.resolve())],
                            cwd=str(root),
                            shell=False,
                        )
                        print(f"[watch_status] 已启动: {exe} {status_path}", flush=True)
                    except OSError as e:
                        print(f"[watch_status] 打开 Cursor 失败: {e}", file=sys.stderr)
                else:
                    print(
                        "[watch_status] 未在 PATH 中找到 cursor，跳过 --open-cursor",
                        file=sys.stderr,
                    )

            for cmd in args.exec:
                print(f"[watch_status] 执行: {cmd}", flush=True)
                try:
                    r = subprocess.run(
                        cmd,
                        cwd=str(root),
                        shell=True,
                        check=False,
                    )
                    print(f"[watch_status] 退出码: {r.returncode}", flush=True)
                except OSError as e:
                    print(f"[watch_status] 执行失败: {e}", file=sys.stderr)

            last_ids = current_set
            save_state(
                state_path,
                {
                    "last_qa_dev_done_ids": sorted(last_ids),
                    "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                },
            )
        else:
            # 周期性心跳，便于确认脚本仍在跑
            ts = time.strftime("%H:%M:%S")
            pending_qa = len(actionable)
            print(
                f"[{ts}] 可验收 dev_done 数={pending_qa} ({', '.join(actionable) or '无'}) | 无新变化",
                flush=True,
            )

        if args.once:
            break
        time.sleep(args.interval)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
