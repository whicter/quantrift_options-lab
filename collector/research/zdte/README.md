# SPY 0DTE 开盘区间 + RSI 预跑(2026-08-27)

**结论:没有可测的方向性优势。不要重跑,不要为它买数据。**
完整记录见 `docs/validation/ZDTE_OPENING_RANGE_PRERUN_2026-08-27.md`。

保留这四个脚本是为了两件事:结论可复核,以及 `prerun.py` 是一份前视偏差的反面教材。

| 文件 | 用途 |
| --- | --- |
| `fetch_spy_1m.py` | 拉 SPY 分钟线到 X9_Pro。**旁路脚本,自带限速声明** |
| `prerun.py` | **第一版,结果作废**。故意保留:它跑出 78% 胜率、t=9,全部来自两个前视偏差 |
| `prerun2.py` | 修正版 |
| `sweep.py` | 4 种水平 × 顺势/反做 × RSI 三档的全网格 |

数据:`/Volumes/X9_Pro/data_seriliazation/quantrift_options-lab/research/minute-bars/`
(425,233 根,2024-09 至 2026-08,7.8MB)。分钟线在现有 Polygon 权限内,重拉不花钱。

```bash
cd collector && PYTHONPATH=$PWD ./venv311/bin/python research/zdte/sweep.py
```
