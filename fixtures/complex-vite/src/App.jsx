import { useMemo, useRef, useState } from "react";

import "./styles.css";
import { requestQuote } from "./quote-api.js";

const INCIDENTS = [
  { id: "refund", title: "Refund request", owner: "Mina Kaya", status: "Open", age: "12m", priority: "High" },
  { id: "timeout", title: "Payment timeout", owner: "Arda Demir", status: "Investigating", age: "28m", priority: "Critical" },
  { id: "verification", title: "Card verification", owner: "Ece Yılmaz", status: "Resolved", age: "1h", priority: "Medium" },
  { id: "renewal", title: "Subscription renewal", owner: "Deniz Şahin", status: "Open", age: "2h", priority: "Low" },
  { id: "chargeback", title: "Chargeback review", owner: "Selin Acar", status: "Investigating", age: "3h", priority: "High" },
];

export function IncidentDashboard() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [quantity, setQuantity] = useState("1");
  const [coupon, setCoupon] = useState("");
  const [quote, setQuote] = useState({ status: "Idle", requestId: null, total: null });
  const latestQuoteRequest = useRef(0);

  const visibleIncidents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return INCIDENTS.filter((incident) => {
      const matchesQuery = !normalizedQuery || `${incident.title} ${incident.owner}`.toLowerCase().includes(normalizedQuery);
      const matchesStatus = status === "All" || incident.status === status;
      return matchesQuery && matchesStatus;
    });
  }, []);

  async function refreshQuote() {
    const requestNumber = latestQuoteRequest.current + 1;
    latestQuoteRequest.current = requestNumber;
    setQuote({ status: "Loading", requestId: null, total: null });
    const result = await requestQuote({ quantity: Number(quantity), coupon });
    setQuote({ status: "Quote ready", requestId: result.requestId, total: result.total });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark">OC</span>
          <div>
            <p className="eyebrow">Operations control</p>
            <h1>Incident workspace</h1>
          </div>
        </div>
        <div className="topbar-meta">
          <span className="live-dot" aria-hidden="true" />
          <span>Live queue</span>
          <span className="avatar" aria-label="Signed in as Alex Morgan">AM</span>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar" aria-label="Workspace navigation">
          <p className="sidebar-label">Workspace</p>
          <button className="nav-item nav-item-active" type="button">Incidents <span>5</span></button>
          <button className="nav-item" type="button">Escalations <span>2</span></button>
          <button className="nav-item" type="button">Runbooks</button>
          <div className="sidebar-footer">
            <p className="sidebar-label">Shift status</p>
            <div className="shift-card"><span className="shift-icon">✓</span><span><strong>All systems</strong><small>Last checked 2m ago</small></span></div>
          </div>
        </aside>

        <main className="content" aria-label="Incident list">
          <div className="content-heading">
            <div>
              <p className="eyebrow">Tuesday · 09:42 UTC</p>
              <h2>Good morning, Alex</h2>
              <p className="muted">Keep an eye on the queue and resolve what needs attention.</p>
            </div>
            <button className="primary-button" type="button">+ Create incident</button>
          </div>

          <section className="metrics-grid" aria-label="Queue summary">
            <article className="metric-card"><span className="metric-label">Open incidents</span><strong>5</strong><span className="metric-trend positive">↓ 12% from yesterday</span></article>
            <article className="metric-card"><span className="metric-label">Median response</span><strong>18m</strong><span className="metric-trend positive">↓ 4m this week</span></article>
            <article className="metric-card"><span className="metric-label">SLA at risk</span><strong>2</strong><span className="metric-trend negative">↑ 1 since 08:00</span></article>
          </section>

          <section className="quote-card" aria-labelledby="quote-title">
            <div><p className="eyebrow">Async pricing</p><h3 id="quote-title">Quote simulator</h3><p className="muted">Trigger two quotes quickly to test latest-request-wins behavior.</p></div>
            <div className="quote-controls">
              <label><span className="metric-label">Quantity</span><input aria-label="Quote quantity" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
              <label><span className="metric-label">Promo code</span><input aria-label="Quote promo code" placeholder="SAVE20" value={coupon} onChange={(event) => setCoupon(event.target.value)} /></label>
              <button className="secondary-button" type="button" data-testid="refresh-quote" onClick={refreshQuote}>Refresh quote</button>
            </div>
            <p className="quote-status" data-testid="quote-status">{quote.status}</p>
            <p className="quote-result" data-testid="quote-result">{quote.requestId ? `Quote v${quote.requestId} applied: $${quote.total.toFixed(2)}` : "No quote applied"}</p>
          </section>

          <section className="incident-card">
            <div className="card-heading">
              <div><h3>Active incidents</h3><p className="muted">Triage the latest customer-impacting events.</p></div>
              <span className="queue-status"><span className="live-dot" aria-hidden="true" /> Auto-refreshing</span>
            </div>
            <div className="filters">
              <label className="search-field">
                <span aria-hidden="true">⌕</span>
                <input aria-label="Search incidents" placeholder="Search incidents or owners" value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
              <label className="select-field"><span>Status</span><select aria-label="Status filter" value={status} onChange={(event) => setStatus(event.target.value)}><option>All</option><option>Open</option><option>Investigating</option><option>Resolved</option></select></label>
            </div>
            <p className="result-count" data-testid="visible-count">Showing {visibleIncidents.length} incidents</p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Incident</th><th>Owner</th><th>Status</th><th>Age</th><th>Priority</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {visibleIncidents.map((incident) => (
                    <tr key={incident.id} data-testid={`incident-row-${incident.id}`}>
                      <td><div className="incident-name"><span className={`incident-icon priority-${incident.priority.toLowerCase()}`}>!</span><span><strong>{incident.title}</strong><small>INC-{incident.id.toUpperCase()}</small></span></div></td>
                      <td><span className="owner"><span className="mini-avatar">{incident.owner.split(" ").map((part) => part[0]).join("")}</span>{incident.owner}</span></td>
                      <td><span className={`status-pill status-${incident.status.toLowerCase()}`}>{incident.status}</span></td>
                      <td className="muted">{incident.age}</td>
                      <td><span className={`priority-label priority-text-${incident.priority.toLowerCase()}`}>{incident.priority}</span></td>
                      <td><button className="text-button" type="button" data-testid={`view-${incident.id}`} onClick={() => setSelectedIncident(incident)}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      {selectedIncident && (
        <div className="drawer-layer" data-testid="incident-drawer-layer">
          <button className="drawer-backdrop" type="button" aria-label="Close incident details" onClick={() => setSelectedIncident(null)} />
          <aside className="drawer" data-testid="incident-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
            <div className="drawer-heading"><div><p className="eyebrow">Incident details</p><h2 id="drawer-title">{selectedIncident.title}</h2></div><button className="close-button" type="button" aria-label="Close" onClick={() => setSelectedIncident(null)}>×</button></div>
            <div className="drawer-status-row"><span className={`status-pill status-${selectedIncident.status.toLowerCase()}`}>{selectedIncident.status}</span><span className="muted">INC-{selectedIncident.id.toUpperCase()}</span></div>
            <div className="drawer-section"><span className="metric-label">Owner</span><span className="owner"><span className="mini-avatar">{selectedIncident.owner.split(" ").map((part) => part[0]).join("")}</span>{selectedIncident.owner}</span></div>
            <div className="drawer-section"><span className="metric-label">Latest update</span><p className="drawer-copy">Customer impact is being monitored. The incident response playbook is active and the next review is scheduled in 15 minutes.</p></div>
            <div className="drawer-actions"><button className="secondary-button" type="button" onClick={() => setSelectedIncident(null)}>Close</button><button className="primary-button" type="button">Open runbook</button></div>
          </aside>
        </div>
      )}
    </div>
  );
}

export function App() {
  return <IncidentDashboard />;
}
