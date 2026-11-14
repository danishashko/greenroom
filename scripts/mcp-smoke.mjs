// Drives the MCP server over stdio like an agent would. Usage: node scripts/mcp-smoke.mjs [--run]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const live = process.argv.includes("--run");
const transport = new StdioClientTransport({ command: "node", args: ["dist/cli.js", "mcp"], env: { ...process.env, GREENROOM_OUT: ".greenroom/mcp-runs" } });
const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));
for (const t of tools.tools) {
  if (!t.outputSchema || !t.annotations) throw new Error(`${t.name} is missing outputSchema or annotations`);
}

const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  return { isError: r.isError ?? false, data: r.structuredContent, text: r.content?.[0]?.text ?? "" };
};

const doctor = await call("greenroom_doctor", {});
console.log("doctor recommended:", doctor.data.recommendedLlm);

const est = await call("greenroom_estimate", { change: "Raise Pro from $49 to $79 per month", llm: "claude-cli", ground: "local", urls: ["https://example.com"] });
console.log("estimate:", JSON.stringify(est.data.estimate.calls), est.data.estimate.cost.note);

const bad = await call("greenroom_estimate", { change: "short" });
console.log("bad input is a structured error:", bad.isError, bad.data?.error?.code ?? bad.text.slice(0, 140));

if (live) {
  const start = await call("greenroom_start", {
    change: "Heroku ends all free dynos, free Postgres and free Redis on November 28, 2022 and deletes inactive accounts",
    kind: "pricing",
    productName: "Heroku",
    audience: "indie developers and students",
    llm: "claude-cli",
    ground: "local",
    urls: ["https://hn.algolia.com/api/v1/items/32594533"],
    personas: 3,
    rounds: 1,
  });
  console.log("started:", start.data.jobId, start.data.status);
  let s = start.data;
  while (s.status === "running") {
    s = (await call("greenroom_status", { jobId: start.data.jobId, waitSeconds: 30 })).data;
    console.log("  status:", s.status, s.stage, s.recentEvents.at(-1));
  }
  console.log("final:", s.status, s.error ? JSON.stringify(s.error) : s.summary.headline);
  if (s.runId) {
    const rep = await call("greenroom_report", { runId: s.runId, format: "paths" });
    console.log("paths:", rep.data.data.html);
    const runs = await call("greenroom_runs", {});
    console.log("runs listed:", runs.data.runs.length);
  }
}
await client.close();
