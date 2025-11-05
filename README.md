# GitMCP - Model Context Protocol Server for GitLab

GitMCP is a Model Context Protocol (MCP) server implementation that provides AI assistants with direct access to GitLab repository documentation and code. It works with both public GitLab repositories (gitlab.com) and self-hosted GitLab instances.

## Credits

This is a fork of the original GitMCP project by Ido Salomon:
- Original repository: https://github.com/idosal/git-mcp
- Original author: Ido Salomon (https://github.com/idosal)

This fork focuses on GitLab-specific features and self-hosted GitLab instance support. All credit for the original implementation goes to the original authors.

## What This Does

GitMCP exposes GitLab repositories through the Model Context Protocol, allowing AI coding assistants to:

- Fetch and search repository documentation
- Search through code using GitLab's search API
- Access nested GitLab group structures (company/team/project)
- Work with private repositories via GitLab access tokens
- Connect to self-hosted GitLab instances

The server runs as a Cloudflare Worker and can be self-hosted on your own infrastructure.

## Architecture

GitMCP implements the Model Context Protocol over Server-Sent Events (SSE) and provides tools that AI assistants can call to access GitLab data. It supports two deployment modes:

1. **Repository-specific endpoints**: Direct access to a single repository
2. **Generic endpoint**: Dynamic access to any repository the AI chooses

The system uses GitLab's REST API v4 for all operations and respects rate limits. It implements caching via Cloudflare KV and R2 to minimize API calls.

## Requirements

- Node.js 18 or later
- pnpm package manager
- Cloudflare Workers account (for cloud deployment)
- GitLab personal access token (for private repositories or self-hosted instances)

## Installation

Clone the repository:

```bash
git clone https://github.com/nalyk/git-mcp.git
cd git-mcp
```

Install dependencies:

```bash
pnpm install
```

## Configuration

### Environment Variables

Create a `.dev.vars` file for local development or configure these in your deployment environment:

```bash
# Required for private repositories
GITLAB_TOKEN="your-gitlab-personal-access-token"

# Required for self-hosted GitLab instances
GITLAB_API_BASE_URL="https://your-gitlab-instance.com/api/v4"

# Optional: AI provider API keys for embedded chat
ANTHROPIC_API_KEY=""
OPENAI_API_KEY=""
XAI_API_KEY=""
```

### GitLab Access Token

To create a GitLab personal access token:

1. Navigate to your GitLab instance: Settings > Access Tokens
2. Create a token with these scopes:
   - `read_api` - Read access to API
   - `read_repository` - Read repository contents

For gitlab.com: https://gitlab.com/-/user_settings/personal_access_tokens
For self-hosted: https://your-gitlab-instance.com/-/user_settings/personal_access_tokens

### Cloudflare Workers Configuration

The application requires these Cloudflare resources:

- KV namespace for caching (binding: `CACHE_KV`)
- R2 bucket for document storage (binding: `DOCS_BUCKET`)
- Vectorize index for semantic search (binding: `VECTORIZE`)
- Durable Objects for session management
- Analytics Engine for metrics (optional)

Configure these in `wrangler.jsonc` before deployment.

## Local Development

Start the development server:

```bash
pnpm dev
```

The server runs on `http://localhost:5173/`

### Testing with MCP Inspector

Install and run the MCP inspector:

```bash
npx @modelcontextprotocol/inspector
```

Configure the inspector:
- Transport Type: SSE
- URL: `http://localhost:5173/your-namespace/your-project`

### URL Structure for Local Testing

The server recognizes these URL patterns:

**Standard GitLab repository:**
```
http://localhost:5173/namespace/project
```

**Nested GitLab groups:**
```
http://localhost:5173/company/team/subteam/project
```

**Subdomain pattern:**
```
http://namespace.localhost:5173/project
```

**Generic endpoint (dynamic repository selection):**
```
http://localhost:5173/docs
```

## Deployment

### Deploying to Cloudflare Workers

Build the application:

```bash
pnpm build
```

Deploy to Cloudflare:

```bash
pnpm deploy
```

Configure environment variables in Cloudflare Workers dashboard or via wrangler:

```bash
wrangler secret put GITLAB_TOKEN
wrangler secret put GITLAB_API_BASE_URL
```

### Self-Hosted Deployment

You can deploy GitMCP to any infrastructure that supports Node.js applications. The application uses:

- React Router for SSR
- Cloudflare Workers runtime (can be replaced with standard Node.js)
- Environment variables for configuration

Adapt the deployment configuration in `wrangler.jsonc` to match your infrastructure.

## Usage with AI Assistants

### Cursor

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "gitlab-docs": {
      "url": "https://your-deployment-domain.com/namespace/project"
    }
  }
}
```

### Claude Desktop

Edit Claude Desktop MCP configuration (Settings > Developer > Edit Config):

```json
{
  "mcpServers": {
    "gitlab-docs": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-deployment-domain.com/namespace/project"
      ]
    }
  }
}
```

### Windsurf

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "gitlab-docs": {
      "serverUrl": "https://your-deployment-domain.com/namespace/project"
    }
  }
}
```

### VSCode

Create `.vscode/mcp.json`:

```json
{
  "servers": {
    "gitlab-docs": {
      "type": "sse",
      "url": "https://your-deployment-domain.com/namespace/project"
    }
  }
}
```

### Cline

Edit `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "gitlab-docs": {
      "url": "https://your-deployment-domain.com/namespace/project",
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## MCP Tools Provided

The server exposes these tools to AI assistants:

### Repository-Specific Endpoints

When connected to a specific repository (`/namespace/project`):

**fetch_documentation**
- Retrieves primary documentation (llms.txt, llms-full.txt, or README.md)
- Returns structured documentation content
- No parameters required

**search_documentation**
- Searches through repository documentation using semantic search
- Parameter: `query` (string) - search terms
- Returns relevant documentation sections with context

**search_code**
- Searches repository code using GitLab search API
- Parameters:
  - `query` (string) - code search terms
  - `page` (number, optional) - pagination
  - `perPage` (number, optional) - results per page (max 100)
- Returns code snippets with file paths and line numbers

**fetch_generic_url_content**
- Fetches content from absolute URLs mentioned in documentation
- Parameter: `url` (string) - absolute URL to fetch
- Respects robots.txt directives
- Returns markdown-converted content

### Generic Endpoint

When using the generic endpoint (`/docs`):

**match_common_libs_owner_repo_mapping**
- Maps common library names to GitLab namespace/project
- Parameter: `library` (string) - library name to match
- Returns namespace and project if found in static mapping

**fetch_generic_documentation**
- Fetches documentation for any GitLab repository
- Parameters:
  - `namespace` (string) - GitLab namespace (can be nested)
  - `project` (string) - project name
- Returns documentation content

**search_generic_documentation**
- Searches documentation for any GitLab repository
- Parameters:
  - `namespace` (string) - GitLab namespace
  - `project` (string) - project name
  - `query` (string) - search terms
- Returns relevant sections

**search_generic_code**
- Searches code for any GitLab repository
- Parameters:
  - `namespace` (string) - GitLab namespace
  - `project` (string) - project name
  - `query` (string) - search terms
  - `page` (number, optional)
  - `perPage` (number, optional)
- Returns code search results

## GitLab-Specific Features

### Nested Group Support

GitLab supports nested groups (e.g., `company/team/subteam/project`). The system correctly parses these structures:

- Namespace: `company/team/subteam`
- Project: `project`

Use the full path in the URL:
```
https://your-deployment.com/company/team/subteam/project
```

### Private Repository Access

Configure `GITLAB_TOKEN` environment variable with a personal access token that has access to the private repositories. The token will be sent with all GitLab API requests using the `PRIVATE-TOKEN` header.

### Self-Hosted GitLab Instances

Set `GITLAB_API_BASE_URL` to your GitLab instance API endpoint:

```bash
GITLAB_API_BASE_URL="https://gitlab.yourcompany.com/api/v4"
```

The system will use this base URL for all GitLab API calls instead of the default `https://gitlab.com/api/v4`.

### Rate Limiting

The GitLab client implements rate limit handling:

- Tracks remaining API calls via response headers
- Automatically delays requests when approaching limits
- Retries rate-limited requests with exponential backoff
- Maximum 3 retries per request

Rate limit information is logged for monitoring:
```
GitLab API rate limit: 1500/2000 remaining, resets at [timestamp]
```

### Caching Strategy

Documentation and file paths are cached using:

1. **Cloudflare KV** - File path cache (1 hour TTL)
2. **Cloudflare R2** - Full documentation storage
3. **Cloudflare tiered cache** - API response caching

Cache TTL by response status:
- 200-299: 3600 seconds (1 hour)
- 404: 60 seconds
- 500-599: No caching

### Documentation Priority

The system fetches documentation in this order:

1. `llms.txt` - AI-optimized documentation
2. `llms-full.txt` - Extended documentation
3. `README.md` - Standard project readme
4. Root directory markdown files

## Repository Structure

```
git-mcp/
├── app/                    # React Router application
│   ├── routes/            # Page routes
│   ├── components/        # React components
│   └── chat/              # Chat interface components
├── src/                   # Server-side code
│   ├── api/
│   │   ├── tools/        # MCP tool implementations
│   │   └── utils/        # GitLab client, caching, etc.
│   ├── shared/           # Shared utilities
│   └── index.ts          # Worker entry point
├── static/               # Static assets
├── wrangler.jsonc       # Cloudflare Workers configuration
└── vite.config.ts       # Vite build configuration
```

## Testing

Run tests:

```bash
pnpm test
```

Run end-to-end tests:

```bash
pnpm test:e2e
```

## Code Quality

Format code:

```bash
pnpm format
```

Run linter:

```bash
pnpm lint:fix
```

## Contributing

Submit pull requests to https://github.com/nalyk/git-mcp

Follow the existing code structure and conventions. Ensure tests pass before submitting.

## License

Apache License 2.0

## Disclaimer

This software is provided as-is without warranty. GitLab repositories accessed through this service are subject to their respective licenses and terms. This project is not affiliated with GitLab Inc. or any mentioned AI tools.
