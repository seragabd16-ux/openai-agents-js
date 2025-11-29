# Trendyol Control Agent Example

This example shows how to wrap the Trendyol Supplier API in agent tools so that an OpenAI agent can manage store operations from a compact command dashboard. It demonstrates:

- Separating read-only and mutating API calls.
- Using `needsApproval` to require human confirmation before risky updates (like changing ad budgets).
- Resuming interrupted runs after a human approves or rejects an action.

> **Never** hard-code production credentials. Keep secrets in environment variables or a secret manager.

## Prerequisites

1. Install dependencies from the repo root:
   ```bash
   pnpm install
   ```
2. Provide the following environment variables before running the example. They can be stored in a `.env` file that you load with `dotenv` or exported in your shell.

   ```bash
   export OPENAI_API_KEY="sk-..."
   export TRENDYOL_SUPPLIER_ID="<your-supplier-id>"
   export TRENDYOL_API_KEY="<your-api-key>"
   export TRENDYOL_API_SECRET="<your-api-secret>"
   # Optional tuning knobs
   export TRENDYOL_BASE_URL="https://api.trendyol.com/sapigw"
   export TRENDYOL_AUTO_APPROVE_MAX_BUDGET="750"
   export TRENDYOL_AUTO_APPROVE_MAX_QUANTITY="25"
   ```

   Replace the placeholder values with your own credentials or sandbox tokens. The helper honors these thresholds when deciding whether to pause for approval.

## Running the Agent

### Web dashboard interface

Launch a lightweight control room that serves a browser UI for chat-style coordination and approvals:

```bash
pnpm --filter trendyol-control start:web
```

The server defaults to port `8787`. Visit [http://localhost:8787](http://localhost:8787) to:

- Send instructions to the agent from a compact Arabic-first dashboard.
- Watch the transcript of model replies, reasoning traces, and tool calls.
- Approve or reject high-risk actions with a single click (optionally auto-approving the same tool for the remainder of the run).

The UI updates automatically after each approval cycle and renders the final structured summary when the agent finishes.

### Single-turn run

```bash
pnpm --filter trendyol-control start -- "راجع المخزون الحالي وقترح حملة لمنتجات الصيف"
```

- The agent gathers context using the read-only tool and may propose updates using the mutating tool.
- If an action crosses the approval threshold (for example, adjusting stock by more than the allowed quantity or creating a campaign above the budget limit) the run pauses and prints the pending approvals.

### Interactive approval loop

For a longer session with inline approvals use:

```bash
pnpm --filter trendyol-control start:interactive
```

When the agent pauses for approval, you will be prompted in the terminal to approve or reject the pending tool call. The run then resumes automatically.

## Files

- [`server.ts`](./server.ts): HTTP dashboard that renders the conversational UI and routes approval decisions.
- [`index.ts`](./index.ts): Entry point that runs the agent once or in interactive mode.
- [`createAgent.ts`](./createAgent.ts): Factory that wires the Trendyol client into a reusable agent definition.
- [`trendyolClient.ts`](./trendyolClient.ts): Minimal API client wrapper with shared authentication, logging, and error handling.
- [`tools.ts`](./tools.ts): Zod-validated tool definitions and approval rules.

Feel free to extend the tools with additional API endpoints, custom guardrails, or storage integrations for your own dashboard.
