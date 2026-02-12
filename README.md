# radian

Analytics and usage insights for [pi-coding-agent](https://github.com/mariozechner/pi-coding-agent) sessions.

**radian** parses pi's JSONL session files and generates usage reports — terminal tables, JSON, and self-contained HTML dashboards.

Named after the [mathematical unit of π](https://en.wikipedia.org/wiki/Radian).

## Install

```bash
npm install -g radian
# or run directly
npx radian
```

## Usage

```bash
# This week's summary (default)
radian

# Tool usage this month
radian tools --period month

# Tool audit: find never/rarely-used tools
radian tools --period month --audit

# Token breakdown by model
radian models --from 2026-02-01 --to 2026-02-28

# Per-project breakdown
radian projects --period quarter

# Individual session details
radian sessions --period week

# Usage trends (ASCII charts)
radian trends --metric tokens --period month
radian trends --metric tool-calls --by tool
radian trends --metric tokens --by model --period year

# Full HTML dashboard (opens in browser)
radian report --period quarter
radian report -o ~/report.html
```

## Commands

| Command    | Description                                |
|------------|--------------------------------------------|
| `summary`  | Overview stats (default)                   |
| `tools`    | Tool usage breakdown & audit               |
| `models`   | Model/provider usage & tokens              |
| `projects` | Per-project breakdown                      |
| `sessions` | Session details                            |
| `trends`   | Usage evolution over time (ASCII charts)   |
| `report`   | Full HTML dashboard (all sections)         |

## Options

| Option               | Description                                            | Default   |
|----------------------|--------------------------------------------------------|-----------|
| `-p, --period`       | `today`, `week`, `month`, `quarter`, `year`, `all`     | `week`    |
| `--from <date>`      | Start date (YYYY-MM-DD)                                |           |
| `--to <date>`        | End date (YYYY-MM-DD)                                  |           |
| `--project <path>`   | Filter by project path (substring match)               |           |
| `-f, --format`       | `table`, `json`                                        | `table`   |
| `-l, --limit <n>`    | Max rows in tables                                     | `20`      |
| `--sessions-dir`     | Override pi session directory                          |           |
| `--extensions-dir`   | Override pi extensions directory                       |           |
| `--no-cache`         | Bypass cache, force re-parse                           |           |
| `--cache-dir`        | Override cache directory                               |           |

### Trends-specific options

| Option           | Description                                          | Default   |
|------------------|------------------------------------------------------|-----------|
| `-m, --metric`   | `tokens`, `sessions`, `tool-calls`, `messages`       | `tokens`  |
| `-b, --by`       | Break down by: `tool`, `model`, `provider`, `project`|           |
| `--top <n>`      | Top N items in breakdown                             | `5`       |

## How it works

Pi stores conversation sessions as JSONL files in `~/.pi/agent/sessions/`. Each file contains typed entries: session headers, user/assistant messages (with tool calls, token counts, costs), tool results, bash executions, and model changes.

Radian discovers and parses these files, aggregates statistics, and presents them in various formats. It uses an mtime-based per-session cache (`~/.cache/pi-stats/v1/`) for fast subsequent runs.

The tool audit feature scans `~/.pi/agent/extensions/` to discover registered tools and compares them against actual usage data to identify never-used or rarely-used tools.

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Watch mode
npm run test:watch

# Build
npm run build

# Run locally
node dist/index.js summary
```

## License

MIT
