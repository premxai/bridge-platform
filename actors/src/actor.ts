import { Actor, Emittable, Persisted, type ActorSocket } from "terse-sdk/actor"

// The neutral incident room. It belongs to no company: the monitor opens it and
// every message the three companies' agents exchange over Agent Relay is written
// here. Calls run one at a time, so simultaneous writes from different companies
// are ordered and never overwrite each other. Connected screens get live updates.

export type Entry = { at: string; company: string; to: string; type: string; text: string }
type Status = "none" | "open" | "identified" | "fixing" | "recovering" | "resolved"

const NEXT_STATUS: Record<string, Status> = {
    ROOT_CAUSE: "identified",
    FIX_PROPOSAL: "fixing",
    FIX_AGREED: "fixing",
    FIX_DEPLOYED: "recovering",
    RESOLVED: "resolved",
}

export class Incident extends Actor<{ viewer: string }, { type: "ping" }, { type: "hello"; writes: number }> {
    @Persisted @Emittable incidentId = ""
    @Persisted @Emittable status: Status = "none"
    @Persisted @Emittable openedAt = ""
    @Persisted @Emittable failedAtOpen = 0
    @Persisted @Emittable suspects: Record<string, "investigating" | "cleared" | "root_cause"> = {}
    @Persisted @Emittable rootCause = ""
    @Persisted @Emittable timeline: Entry[] = []
    @Persisted @Emittable writes = 0
    @Persisted @Emittable duplicateAlerts = 0

    // Opens the incident, or folds a repeat alert into the open one.
    async open(incidentId: string, failed: number): Promise<{ opened: boolean; incidentId: string }> {
        if (this.status !== "none" && this.status !== "resolved") {
            this.duplicateAlerts += 1
            return { opened: false, incidentId: this.incidentId }
        }
        this.incidentId = incidentId
        this.status = "open"
        this.openedAt = new Date().toISOString()
        this.failedAtOpen = failed
        this.suspects = {}
        this.rootCause = ""
        this.timeline = [{ at: this.openedAt, company: "monitor", to: "#incidents", type: "INCIDENT_OPENED", text: `${failed} failed checkouts in 30 seconds` }]
        this.writes += 1
        return { opened: true, incidentId }
    }

    // Records one message between companies and updates who is cleared or at fault.
    async record(entry: Entry): Promise<number> {
        if (this.status === "none") return this.writes
        this.timeline = [...this.timeline, entry].slice(-200)
        const s = { ...this.suspects }
        if (entry.company in s === false && ["shopco", "payflow", "shieldco"].includes(entry.company)) s[entry.company] = "investigating"
        if (entry.type === "INNOCENT") s[entry.company] = "cleared"
        if (entry.type === "ROOT_CAUSE") {
            s[entry.company] = "root_cause"
            this.rootCause = entry.text
        }
        this.suspects = s
        const next = NEXT_STATUS[entry.type]
        if (next) this.status = next
        this.writes += 1
        return this.writes
    }

    async state() {
        return {
            incidentId: this.incidentId, status: this.status, openedAt: this.openedAt, failedAtOpen: this.failedAtOpen,
            suspects: this.suspects, rootCause: this.rootCause, timeline: this.timeline, writes: this.writes, duplicateAlerts: this.duplicateAlerts,
        }
    }

    async reset(): Promise<void> {
        this.incidentId = ""
        this.status = "none"
        this.openedAt = ""
        this.failedAtOpen = 0
        this.suspects = {}
        this.rootCause = ""
        this.timeline = []
        this.writes = 0
        this.duplicateAlerts = 0
    }

    async onConnect(socket: ActorSocket<{ viewer: string }, { type: "hello"; writes: number }>): Promise<void> {
        socket.send({ type: "hello", writes: this.writes })
    }
}
