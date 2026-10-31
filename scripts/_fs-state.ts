import { readEnv } from "./lib/env.ts";
process.env.FREESTYLE_API_KEY = readEnv("platform").FREESTYLE_API_KEY;
const { Freestyle } = await import("freestyle");
const fs = new Freestyle();
for (const s of ["bridge-shopco", "bridge-payflow", "bridge-shieldco"]) {
  const d: any = await fs.vms.get(s);
  const r = await fs.vms.ref(s).exec("ps aux | grep -v grep | grep -c 'node src/server.ts'; tail -3 /home/ubuntu/app/logs/server.log");
  console.log(s, d.state, "idle", d.idleTimeoutSeconds, "autoDelete", d.autoDeleteSeconds, "| procs", r.stdout.replace(/\n/g, " | "));
}
