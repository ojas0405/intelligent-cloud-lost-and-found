import { useState } from "react";
import { ArrowRight, Check, ShieldCheck, MapPin, Clock } from "lucide-react";
import { Badge, ItemImage, Empty, Timeline } from "../components/Shared";
import { post } from "../services/api";
export default function Matches({ matches, refresh }) {
  const [claim, setClaim] = useState(null),
    [answer, setAnswer] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function begin(m) {
    setBusy(true);
    setError("");
    try {
      let cached = JSON.parse(sessionStorage.getItem(m.itemId) || "null");
      if (m.status === "CLAIM_REQUESTED" && m.claimExpiresAt < Date.now()) {
        await post(`/claims/${m.lostId}/cancel`, { matchId: m.itemId });
        sessionStorage.removeItem(m.itemId);
        cached = null;
      }
      if (cached) {
        setClaim({ ...cached, match: m });
      } else {
        const r = await post(`/claims/${m.lostId}`, { matchId: m.itemId });
        const c = { ...r, matchId: m.itemId, lostId: m.lostId };
        sessionStorage.setItem(m.itemId, JSON.stringify(c));
        setClaim({ ...c, match: m });
      }
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    setBusy(true);
    try {
      await post(`/claims/${claim.lostId}/cancel`, {
        matchId: claim.matchId,
        claimToken: claim.claimToken,
      });
      sessionStorage.removeItem(claim.matchId);
      setClaim(null);
      setAnswer("");
      setError("");
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post(`/claims/${claim.lostId}/verify`, {
        matchId: claim.matchId,
        claimToken: claim.claimToken,
        answer,
      });
      setClaim({ ...claim, verified: true });
      setAnswer("");
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function returned() {
    setBusy(true);
    setError("");
    try {
      await post(`/claims/${claim.lostId}/returned`, {
        matchId: claim.matchId,
        claimToken: claim.claimToken,
      });
      sessionStorage.removeItem(claim.matchId);
      setClaim(null);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-intro">
        <p>Connections that count</p>
        <h2>A familiar item could be one match away.</h2>
        <span>Compare the evidence, verify ownership, and bring it home.</span>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {!matches.length ? (
        <section className="panel">
          <Empty
            title="No possible matches have been identified yet."
            text="Report a lost and a found item. AWS Lambda will compare their details."
          />
        </section>
      ) : (
        <div className="matches-grid">
          {matches.map((m) => (
            <section className="panel match-card" key={m.itemId}>
              <div className="match-top">
                <Badge tone={m.status === "RETURNED" ? "green" : "blue"}>
                  {m.status.replaceAll("_", " ")}
                </Badge>
                <span className="match-score">
                  {m.score}
                  <small>% match score</small>
                </span>
              </div>
              <div className="comparison">
                {[m.lost, m.found].map((i) => (
                  <div key={i.itemId}>
                    <div className="compare-image">
                      <ItemImage item={i} />
                      <Badge tone={i.type === "LOST" ? "amber" : "blue"}>
                        {i.type}
                      </Badge>
                    </div>
                    <h3>{i.itemName}</h3>
                    <p>
                      <MapPin size={13} />
                      {i.location}
                    </p>
                    <p>
                      <Clock size={13} />
                      {i.date} · {i.time}
                    </p>
                  </div>
                ))}
              </div>
              <div className="explanation">
                <h4>Why these items matched</h4>
                {m.explanation.map((s) => (
                  <div key={s.signal}>
                    <span>
                      <Check size={14} />
                      {s.label}
                    </span>
                    <strong>
                      +{s.points}
                      <small> / {s.max}</small>
                    </strong>
                  </div>
                ))}
              </div>
              <Timeline status={m.status} />
              <button
                className="primary"
                disabled={busy || m.status === "RETURNED"}
                onClick={() => begin(m)}
              >
                <ShieldCheck size={16} />
                {m.status === "VERIFIED"
                  ? "Complete return"
                  : m.status === "CLAIM_REQUESTED"
                    ? "Continue verification"
                    : m.status === "RETURNED"
                      ? "Returned to owner"
                      : "Request claim"}
                <ArrowRight size={15} />
              </button>
            </section>
          ))}
        </div>
      )}
      {claim && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Ownership verification"
          >
            <button
              className="modal-close"
              onClick={() => setClaim(null)}
              aria-label="Close verification"
            >
              ×
            </button>
            <ShieldCheck size={35} />
            <h2>
              {claim.verified || claim.match.status === "VERIFIED"
                ? "Ownership verified."
                : "A small detail. A secure reunion."}
            </h2>
            {claim.verified || claim.match.status === "VERIFIED" ? (
              <>
                <p>
                  Confirm that the item has been physically returned to its
                  owner.
                </p>
                <button className="primary" disabled={busy} onClick={returned}>
                  Mark as returned
                </button>
              </>
            ) : (
              <>
                <form onSubmit={verify}>
                  <p>{claim.question}</p>
                  <label>
                    Your answer
                    <input
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      required
                      maxLength={250}
                      autoComplete="off"
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    Verify ownership
                  </button>
                </form>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={cancel}
                >
                  Cancel this claim
                </button>
              </>
            )}
            {error && <div className="error-banner">{error}</div>}
            <small>Claim sessions expire after 15 minutes.</small>
          </section>
        </div>
      )}
    </>
  );
}
