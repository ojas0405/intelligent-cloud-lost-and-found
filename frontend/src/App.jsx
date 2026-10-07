import { useState } from "react";
import {
  LayoutDashboard,
  Search,
  Plus,
  PackageSearch,
  GitCompareArrows,
  Cloud,
  Network,
  ArrowUpRight,
  ArrowRight,
  CheckCircle2,
  MapPin,
  RefreshCw,
  Menu,
  X,
  ChevronRight,
  ShieldCheck,
  Package,
  TrendingUp,
  Info,
  Trash2,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useDashboard } from "./hooks/useDashboard";
import { request, post } from "./services/api";
import {
  Badge,
  ItemCard,
  ItemImage,
  Timeline,
  Empty,
  CloudPanel,
  SectionTitle,
  ActivityList,
} from "./components/Shared";
import Report from "./pages/Report";
import Matches from "./pages/Matches";
import Architecture from "./pages/Architecture";
const nav = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["lost", "Report Lost", Search],
  ["found", "Report Found", Plus],
  ["matches", "Matches", GitCompareArrows],
  ["items", "All Items", PackageSearch],
  ["activity", "Cloud Activity", Cloud],
  ["about", "About / Architecture", Network],
];
export default function App() {
  const data = useDashboard(),
    [page, setPage] = useState("dashboard"),
    [mobile, setMobile] = useState(false),
    [selected, setSelected] = useState(null),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [sort, setSort] = useState("newest"),
    [localError, setLocalError] = useState(""),
    [confirmDelete, setConfirmDelete] = useState(false);
  const active = nav.find((n) => n[0] === page);
  const connected =
    data.cloud &&
    ["S3", "DynamoDB", "Lambda"].every((k) => data.cloud[k] === "Connected");
  function go(p) {
    setPage(p);
    setMobile(false);
    setLocalError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function deleteItem() {
    try {
      await request(`/items/${selected.itemId}`, { method: "DELETE" });
      setSelected(null);
      setConfirmDelete(false);
      data.refresh();
    } catch (e) {
      setLocalError(e.message);
    }
  }
  const filtered = data.items
    .filter(
      (i) =>
        (filter === "ALL" ||
          (filter === "MATCHED" &&
            i.bestMatchScore > 0 &&
            i.status !== "RETURNED") ||
          (filter === "RETURNED" && i.status === "RETURNED") ||
          i.type === filter) &&
        [i.itemName, i.description, i.category, i.location]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "score"
        ? (b.bestMatchScore || 0) - (a.bestMatchScore || 0)
        : sort === "oldest"
          ? a.createdAt.localeCompare(b.createdAt)
          : b.createdAt.localeCompare(a.createdAt),
    );
  return (
    <div className="app">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a href="#dashboard" className="brand" onClick={() => go("dashboard")}>
          <span className="brand-mark">
            <Search size={24} />
            <i />
          </span>
          <span>
            FindBack<small>LOST. FOUND. RECONNECTED.</small>
          </span>
        </a>
        <div className="workspace-label">
          CAMPUS WORKSPACE <Badge>01</Badge>
        </div>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => go(id)}
            >
              <Icon size={18} />
              {label}
              {id === "matches" && data.stats.matches > 0 && (
                <span className="nav-count">{data.stats.matches}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="cloud-mini">
            <span className={`status-dot ${connected ? "green" : "amber"}`} />
            <strong>AWS Cloud</strong>
            <small>
              {connected
                ? "Services connected"
                : data.cloud
                  ? "Setup required"
                  : "Checking services…"}
            </small>
            <button onClick={() => go("activity")}>
              View cloud status <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="profile">
            <div>FB</div>
            <span>
              Campus community<small>FindBack workspace</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div>
            <button
              className="menu-button"
              aria-label="Toggle navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{active[1]}</strong>
          </div>
          <div>
            <Badge tone={connected ? "green" : "neutral"}>
              <span className={`status-dot ${connected ? "green" : "amber"}`} />
              {connected ? "AWS connected" : "AWS setup required"}
            </Badge>
            <button
              className="icon-button"
              title="Refresh data"
              aria-label="Refresh data"
              onClick={data.refresh}
            >
              <RefreshCw size={16} />
            </button>
            <span className="avatar">FB</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <p>INTELLIGENT CLOUD LOST & FOUND</p>
              <h1>{active[1]}</h1>
              <span>
                {page === "dashboard"
                  ? "A clearer picture of your campus. A better chance of finding it."
                  : page === "lost"
                    ? "Let’s get your belongings back where they belong."
                    : page === "found"
                      ? "Found something? Be the reason someone smiles today."
                      : page === "items"
                        ? "All campus reports, in one place."
                        : page === "activity"
                          ? "Follow every real step through the AWS cloud."
                          : page === "matches"
                            ? "Explainable matches. Thoughtful verification."
                            : "The technology behind every connection."}
              </span>
            </div>
            {!["lost", "found"].includes(page) && (
              <button className="primary" onClick={() => go("lost")}>
                <Plus size={17} />
                Report an item
              </button>
            )}
          </div>
          {data.error && (
            <div className="error-banner" role="alert">
              {data.error}{" "}
              <button className="text-button" onClick={data.refresh}>
                Retry
              </button>
            </div>
          )}
          {!data.loading && !data.cloud?.configured && (
            <div className="setup-banner">
              <Info size={19} />
              <div>
                <strong>Your cloud workspace is ready to connect.</strong>
                <span>
                  AWS is Not Configured. Add your backend environment variables
                  and deploy the matching Lambda to enable reports.
                </span>
              </div>
              <button onClick={() => go("about")}>
                See architecture <ArrowRight size={15} />
              </button>
            </div>
          )}
          {page === "dashboard" && (
            <>
              <section className="hero">
                <div>
                  <Badge tone="blue">A LITTLE LOST. NEVER FORGOTTEN.</Badge>
                  <h2>
                    Let’s bring it
                    <br />
                    back <span>together.</span>
                  </h2>
                  <p>
                    From a missing bottle to a favorite backpack,
                    <br />
                    turn a campus report into a happy reunion.
                  </p>
                  <div>
                    <button className="primary" onClick={() => go("lost")}>
                      <Search size={16} />I lost something
                    </button>
                    <button className="secondary" onClick={() => go("found")}>
                      <Plus size={16} />I found something
                    </button>
                  </div>
                  <small>
                    <ShieldCheck size={13} /> Private images. Secure cloud
                    processing.
                  </small>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="art-cloud">
                    <Cloud size={47} />
                  </div>
                  <div className="art-card art-lost">
                    <span className="art-emoji">🎒</span>
                    <Badge tone="amber">LOST</Badge>
                    <strong>A familiar backpack</strong>
                    <small>
                      <MapPin size={10} /> Somewhere on campus
                    </small>
                  </div>
                  <div className="art-card art-found">
                    <span className="art-emoji">🎒</span>
                    <Badge tone="blue">FOUND</Badge>
                    <strong>A chance to reconnect</strong>
                    <small>
                      <CheckCircle2 size={10} /> Every detail helps
                    </small>
                  </div>
                  <div className="art-check">
                    <CheckCircle2 size={26} />
                  </div>
                  <div className="art-note">Powered by AWS cloud</div>
                </div>
              </section>
              <div className="stats-grid">
                {[
                  [
                    Search,
                    "Lost items",
                    data.stats.lost,
                    "Reported by our community",
                    "amber",
                  ],
                  [
                    Package,
                    "Found items",
                    data.stats.found,
                    "Ready to find their owners",
                    "blue",
                  ],
                  [
                    GitCompareArrows,
                    "Possible matches",
                    data.stats.matches,
                    "Connections worth exploring",
                    "violet",
                  ],
                  [
                    CheckCircle2,
                    "Recovered items",
                    data.stats.recovered,
                    "Back where they belong",
                    "green",
                  ],
                ].map(([Icon, label, value, subtitle, tone]) => (
                  <section className="stat-card" key={label}>
                    <div>
                      <span className={`square-icon ${tone}`}>
                        <Icon size={19} />
                      </span>
                      <span>{label}</span>
                    </div>
                    <strong>{value}</strong>
                    <small>{subtitle}</small>
                  </section>
                ))}
              </div>
              <div className="dashboard-grid">
                <section className="panel recent-panel">
                  <SectionTitle
                    title="Recently reported"
                    subtitle="Someone’s missing piece might be right here."
                    action={
                      <button
                        className="text-button"
                        onClick={() => go("items")}
                      >
                        View all <ArrowRight size={14} />
                      </button>
                    }
                  />
                  {data.items.length ? (
                    <div className="items-grid compact">
                      {data.items.slice(0, 3).map((i) => (
                        <ItemCard
                          key={i.itemId}
                          item={i}
                          onOpen={setSelected}
                        />
                      ))}
                    </div>
                  ) : (
                    <Empty
                      action={
                        <button
                          className="secondary"
                          onClick={() => go("lost")}
                        >
                          Create your first report <ArrowRight size={14} />
                        </button>
                      }
                    />
                  )}
                </section>
                <section className="panel recovery-panel">
                  <SectionTitle
                    title="Every reunion matters"
                    subtitle="Recovery rate of reported lost items"
                  />
                  <div
                    className="recovery-ring"
                    style={{ "--rate": `${data.stats.recoveryRate * 3.6}deg` }}
                  >
                    <div>
                      <strong>
                        {data.stats.recoveryRate}
                        <small>%</small>
                      </strong>
                      <span>recovery rate</span>
                    </div>
                  </div>
                  <p>
                    <strong>{data.stats.recovered}</strong> lost items returned
                    to their owners
                  </p>
                  <span className="recovery-note">
                    <TrendingUp size={16} /> Small actions. Meaningful outcomes.
                  </span>
                </section>
              </div>
              <div className="two-columns">
                <section className="panel">
                  <SectionTitle
                    title="Campus at a glance"
                    subtitle="Where lost items are reported"
                  />
                  {data.stats.locations.length ? (
                    <div className="chart-wrap">
                      <ResponsiveContainer width="100%" height={215}>
                        <BarChart
                          data={data.stats.locations.slice(0, 5)}
                          margin={{ left: -25, right: 10 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="#edf1f6"
                          />
                          <XAxis
                            dataKey="name"
                            fontSize={11}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            allowDecimals={false}
                            fontSize={11}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip />
                          <Bar
                            dataKey="count"
                            fill="#53b8d4"
                            radius={[5, 5, 0, 0]}
                            maxBarSize={35}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="quiet-state">
                      <MapPin size={27} />
                      <p>No location trends yet.</p>
                      <small>Calculated from actual lost-item reports.</small>
                    </div>
                  )}
                  <div className="location-cards">
                    {data.stats.locations.slice(0, 4).map((l) => (
                      <div
                        key={l.name}
                        style={{
                          background: `rgba(40,166,195,${0.04 + (0.13 * l.count) / Math.max(...data.stats.locations.map((x) => x.count))})`,
                        }}
                      >
                        <MapPin size={13} />
                        <span>{l.name}</span>
                        <strong>{l.count}</strong>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <SectionTitle
                    title="Common item categories"
                    subtitle="A closer look at what goes missing"
                  />
                  {data.stats.categories.length ? (
                    <div className="category-chart">
                      <ResponsiveContainer width="52%" height={215}>
                        <PieChart>
                          <Pie
                            data={data.stats.categories}
                            dataKey="count"
                            nameKey="name"
                            innerRadius={60}
                            outerRadius={85}
                            paddingAngle={4}
                          >
                            {data.stats.categories.map((c, i) => (
                              <Cell
                                key={c.name}
                                fill={
                                  [
                                    "#42adc8",
                                    "#8bc9dc",
                                    "#d7eaf2",
                                    "#c4b7e9",
                                    "#efc898",
                                  ][i % 5]
                                }
                              />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div>
                        {data.stats.categories.map((c, i) => (
                          <p key={c.name}>
                            <i
                              style={{
                                background: [
                                  "#42adc8",
                                  "#8bc9dc",
                                  "#d7eaf2",
                                  "#c4b7e9",
                                  "#efc898",
                                ][i % 5],
                              }}
                            />
                            {c.name}
                            <strong>{c.count}</strong>
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="quiet-state">
                      <PackageSearch size={27} />
                      <p>No category trends yet.</p>
                      <small>Report items to start building a picture.</small>
                    </div>
                  )}
                </section>
              </div>
              <div className="two-columns">
                <section className="panel">
                  <SectionTitle
                    title="Recent cloud activity"
                    subtitle="Real actions. Visible progress."
                    action={
                      <button
                        className="text-button"
                        onClick={() => go("activity")}
                      >
                        View all <ArrowRight size={14} />
                      </button>
                    }
                  />
                  <ActivityList activity={data.activity} limit={4} />
                </section>
                <section className="panel">
                  <SectionTitle
                    title="AWS cloud status"
                    subtitle={data.cloud?.region || "Checking configuration"}
                  />
                  <CloudPanel cloud={data.cloud} />
                </section>
              </div>
              {data.matches.length > 0 && (
                <section className="panel">
                  <SectionTitle
                    title="Recently matched"
                    action={
                      <button
                        className="text-button"
                        onClick={() => go("matches")}
                      >
                        Review matches <ArrowRight size={14} />
                      </button>
                    }
                  />
                  {data.matches.slice(0, 3).map((m) => (
                    <button
                      key={m.itemId}
                      className="recent-match"
                      onClick={() => go("matches")}
                    >
                      <GitCompareArrows size={18} />
                      <span>
                        {m.lost.itemName} ↔ {m.found.itemName}
                      </span>
                      <Badge tone="blue">{m.score}% match score</Badge>
                    </button>
                  ))}
                </section>
              )}
            </>
          )}
          {["lost", "found"].includes(page) && (
            <Report
              key={page}
              type={page.toUpperCase()}
              cloud={data.cloud}
              onComplete={data.refresh}
              onMatches={() => go("matches")}
            />
          )}
          {page === "matches" && (
            <Matches matches={data.matches} refresh={data.refresh} />
          )}
          {page === "items" && (
            <>
              <div className="filters">
                <div className="search-field">
                  <Search size={17} />
                  <input
                    aria-label="Search items"
                    placeholder="Search name, description, category, location…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter items"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  {["ALL", "LOST", "FOUND", "MATCHED", "RETURNED"].map((f) => (
                    <option key={f} value={f}>
                      {f === "ALL"
                        ? "All items"
                        : f.charAt(0) + f.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Sort items"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="score">Highest match score</option>
                </select>
              </div>
              <p className="result-count">
                {filtered.length} {filtered.length === 1 ? "item" : "items"}
              </p>
              {filtered.length ? (
                <div className="items-grid">
                  {filtered.map((i) => (
                    <ItemCard key={i.itemId} item={i} onOpen={setSelected} />
                  ))}
                </div>
              ) : (
                <section className="panel">
                  <Empty
                    title={
                      query || filter !== "ALL"
                        ? "No items match these filters."
                        : undefined
                    }
                  />
                </section>
              )}
            </>
          )}
          {page === "activity" && (
            <>
              <div className="two-columns">
                <section className="panel">
                  <SectionTitle
                    title="AWS service connections"
                    subtitle="Checks against your configured AWS resources"
                  />
                  <CloudPanel cloud={data.cloud} />
                  <p className="small muted">
                    Rekognition is verified on upload. A configured service is
                    not proof of a successful API call.
                  </p>
                </section>
                <section className="panel cloud-explainer">
                  <Cloud size={32} />
                  <h2>
                    Behind every match,
                    <br />a real cloud workflow.
                  </h2>
                  <p>
                    Private S3 storage → DynamoDB record → Rekognition labels →
                    Lambda matching → optional SNS email.
                  </p>
                  <small>
                    Application events appear below. Lambda execution logs
                    remain in Amazon CloudWatch.
                  </small>
                </section>
              </div>
              <section className="panel">
                <SectionTitle
                  title="Application activity"
                  subtitle="Latest 100 events · timestamps shown in your local time"
                />
                <ActivityList activity={data.activity} limit={100} />
              </section>
            </>
          )}
          {page === "about" && <Architecture />}
          <footer>
            <span>
              FindBack <b>·</b> Reconnect people with what they lost.
            </span>
            <span>
              <ShieldCheck size={12} /> Built with care. Powered by AWS.
            </span>
          </footer>
        </main>
      </div>
      {selected && (
        <div className="modal-backdrop">
          <section
            className="modal item-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Item details"
          >
            <button
              className="modal-close"
              aria-label="Close details"
              onClick={() => {
                setSelected(null);
                setConfirmDelete(false);
                setLocalError("");
              }}
            >
              ×
            </button>
            <div className="detail-image">
              <ItemImage item={selected} />
            </div>
            <Badge tone={selected.type === "LOST" ? "amber" : "blue"}>
              {selected.type}
            </Badge>
            <h2>{selected.itemName}</h2>
            <p>{selected.description}</p>
            <p className="small muted">
              {selected.category} · {selected.color} · {selected.location} ·{" "}
              {selected.date} {selected.time}
            </p>
            <Timeline status={selected.status} />
            <h4>Rekognition labels</h4>
            <div className="labels">
              {selected.detectedLabels.length ? (
                selected.detectedLabels.map((l) => (
                  <Badge tone="blue" key={l.Name}>
                    {l.Name}
                  </Badge>
                ))
              ) : (
                <Badge>Analysis Pending</Badge>
              )}
            </div>
            <p className="small muted">
              Analysis: {selected.analysisStatus} · Matching:{" "}
              {selected.matchingStatus}
            </p>
            {selected.processingError && (
              <div className="error-banner">
                {selected.processingError}
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      await post(`/items/${selected.itemId}/retry`, {});
                      setSelected(null);
                      data.refresh();
                    } catch (e) {
                      setLocalError(e.message);
                    }
                  }}
                >
                  Retry processing
                </button>
              </div>
            )}
            <button
              className="secondary"
              onClick={() => {
                setSelected(null);
                go("matches");
              }}
            >
              Review matches <ArrowRight size={15} />
            </button>
            {confirmDelete ? (
              <div className="delete-confirm">
                <p>Delete this report, its image and related matches?</p>
                <button className="danger" onClick={deleteItem}>
                  Confirm delete
                </button>
                <button
                  className="text-button"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="text-button danger-text"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={14} />
                Delete report
              </button>
            )}
            {localError && <div className="error-banner">{localError}</div>}
          </section>
        </div>
      )}
    </div>
  );
}
