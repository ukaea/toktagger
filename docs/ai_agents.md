# AI Agents
The TokTagger server comes with an optional MCP server which can be enabled to allow AI agents to pull, inspect and push data to the server.

## Server Setup
To enable the MCP server, make sure the MCP optional dependencies are installed:
```
pip install toktagger[mcp]
```

You can then enable the MCP server from the `toktagger.toml` configuration file:
```
[server]
mcp_enabled = true
```
Or via environment token:
```
SERVER_MCP_ENABLED = true
```

## User Setup
For your AI agent to be able to access the MCP server, you will need to configure it within your harness.

Firstly, login to the TokTagger UI and go to the `Profile` page. Create an `MCP` token, and record the value (this is only shown once).

Next, add an entry in your agent's MCP configuration. You will need to provide:

* The URL to the server TokTagger server at `/mcp`, eg: `http://localhost:8002/mcp/`
* The transport method (either HTTP or HTTPS)
* The MCP token as a header, in the form `"Authorization": "Bearer <token>"`

Exact configuration will be different for each harness. For example, with `Pi`:

1. Open the configuration file at `~/.pi/agent/mcp.json`
2. Create the following entry, using your URL, transport method and MCP token:

```json
{
  "mcpServers": {
    "toktagger": {
      "url": "http://localhost:8002/mcp/",
      "transport": "http",
      "headers": {
              "Authorization": "Bearer tt_mcp_5OFh0-ObD5PexXcfM94sgShrdJANwKevhKgwzOLdVjI"
      }
    }
  }
}
```