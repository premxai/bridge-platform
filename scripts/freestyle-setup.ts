// One-time Freestyle setup: one VM per company, each with a public HTTPS address
// (<slug>.style.dev) routed to its service port. Writes the addresses into the
// platform's and each company's .env. Safe to re-run: existing VMs are reused.
import { COMPANIES, readEnv, setEnv } from "./lib/env.ts";

const env = readEnv("platform");
process.env.FREESTYLE_API_KEY = env.FREESTYLE_API_KEY;
const { Freestyle } = await import("freestyle");
const freestyle = new Freestyle();

const PORT: Record<string, number> = { shopco: 4001, payflow: 4002, shieldco: 4003 };
const PARTNER: Record<string, string> = { shopco: "PAYFLOW_URL", payflow: "SHIELDCO_URL" };
const SUFFIX = env.FREESTYLE_DOMAIN_SUFFIX || "hh31";

const urls: Record<string, string> = {};
for (const company of COMPANIES.filter((c) => PORT[c])) {
  const slug = `bridge-${company}`;
  const domain = `bridge-${company}-${SUFFIX}.style.dev`;
  let vmId: string;
  try {
    vmId = (await freestyle.vms.get(slug)).id;
    console.log(`${company}: reusing VM ${vmId}`);
  } catch {
    const created = await freestyle.vms.create({
      slug,
      displayName: `Bridge · ${company}`,
      metadata: { project: "bridge", company },
      idleTimeoutSeconds: 6 * 3600,
      // Outbound internet so it can call its partner's public address.
      firewall: { rules: [{ action: "allow", source: {}, destination: { public: true } }] },
      // Inbound HTTPS from the internet to the service port.
      tls: { rules: [{ action: "allow", domain, source: { public: true }, destination: { port: PORT[company] } }] },
    });
    vmId = created.vmId;
    console.log(`${company}: created VM ${vmId}`);
  }
  urls[company] = `https://${domain}`;
  setEnv(company, "FREESTYLE_VM", slug);
  setEnv(company, "FREESTYLE_API_KEY", env.FREESTYLE_API_KEY);
  setEnv(company, "SELF_URL", urls[company]);
  setEnv("platform", `${company.toUpperCase()}_URL`, urls[company]);
}
for (const [company, key] of Object.entries(PARTNER)) {
  const partner = key.replace("_URL", "").toLowerCase();
  setEnv(company, key, urls[partner]);
}
console.log(JSON.stringify(urls, null, 2));
