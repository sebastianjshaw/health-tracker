# Health Tracker — MCP server

A local [MCP](https://modelcontextprotocol.io) server that lets **Claude Desktop** read and update your Health Tracker data by talking directly to the same Turso database the web app uses.

## Tools

| Tool | What it does |
| --- | --- |
| `get_day` | Food entries + nutrition totals for a date (logged + recurring defaults) |
| `search_foods` | Search your food library |
| `log_food` | Add a food entry to a meal (absolute totals for the portion) |
| `add_food_from_library` | Add an existing library food to a meal by id |
| `log_weight` | Record weight / body-fat / waist / resting HR |
| `get_weight_trend` | Recent weight measurements |
| `log_bloodwork` | Save a dated set of blood/lab markers |
| `get_bloodwork` | Read all recorded lab results |
| `get_goals` | Calorie/protein targets, goal weight, meal split |

## Setup (Claude Desktop)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) and add:

```json
{
  "mcpServers": {
    "health-tracker": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "/Users/Sebastian.Shaw/Documents/Code/health-tracker/mcp/server.ts"
      ],
      "env": {
        "DATABASE_URL": "libsql://YOUR-DB.turso.io",
        "DATABASE_AUTH_TOKEN": "YOUR_TURSO_TOKEN"
      }
    }
  }
}
```

Use the **same** `DATABASE_URL` / `DATABASE_AUTH_TOKEN` as your Vercel deployment so Claude Desktop and the web app share data. Restart Claude Desktop, then try: *"What did I eat today?"*, *"Log 2 eggs and toast for breakfast"*, *"Record my weight at 96.4 kg"*, or *"Add my latest bloodwork."*

> Runs locally on your machine; the Turso token stays in your local config. To point it at local dev data instead, set `DATABASE_URL=file:/Users/Sebastian.Shaw/Documents/Code/health-tracker/local.db` and omit the token.
