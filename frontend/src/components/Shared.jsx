import { useEffect, useState } from "react";
import {
  PackageSearch,
  MapPin,
  Clock,
  Check,
  ImageOff,
  Cloud,
  ArrowRight,
  Search,
} from "lucide-react";
import { request } from "../services/api";
export function Badge({ children, tone = "" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Empty({
  title = "No lost or found items yet.",
  text = "Every reunion begins with a report.",
  action,
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <PackageSearch size={32} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function ItemImage({ item }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    const load = () =>
      request(`/items/${item.itemId}/image-url`)
        .then((r) => {
          if (live) setUrl(r.url);
        })
        .catch(() => {
          if (live) setUrl("");
        });
    load();
    const timer = setInterval(load, 240000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [item.itemId]);
  return url ? (
    <img
      className="item-image"
      src={url}
      alt={item.itemName}
      onError={() => setUrl("")}
    />
  ) : (
    <div className="image-placeholder">
      <ImageOff size={26} />
      <span>Private item image</span>
    </div>
  );
}
export function ItemCard({ item, onOpen }) {
  return (
    <button className="item-card" onClick={() => onOpen(item)}>
      <div className="item-photo">
        <ItemImage item={item} />
        <Badge tone={item.type === "LOST" ? "amber" : "blue"}>
          {item.type}
        </Badge>
      </div>
      <div className="item-copy">
        <div className="item-card-title">
          <h3>{item.itemName}</h3>
          {item.bestMatchScore > 0 && (
            <span className="score-small">{item.bestMatchScore}%</span>
          )}
        </div>
        <p>
          <MapPin size={13} />
          {item.location}
        </p>
        <p>
          <Clock size={13} />
          {item.date} · {item.time}
        </p>
        <div className="card-bottom">
          <span>{item.category}</span>
          <span className="status-text">
            {item.status.replaceAll("_", " ").toLowerCase()}
          </span>
        </div>
      </div>
    </button>
  );
}
const stages = [
  "REPORTED",
  "ANALYZED",
  "POSSIBLE_MATCH",
  "CLAIM_REQUESTED",
  "VERIFIED",
  "RETURNED",
];
export function Timeline({ status }) {
  const current = stages.indexOf(status);
  return (
    <div className="timeline">
      {[
        "Reported",
        "Cloud analyzed",
        "Possible match",
        "Claim requested",
        "Ownership verified",
        "Returned",
      ].map((label, i) => (
        <div className={i <= current ? "done" : ""} key={label}>
          <span>{i <= current ? <Check size={12} /> : i + 1}</span>
          <small>{label}</small>
        </div>
      ))}
    </div>
  );
}
export function CloudPanel({ cloud }) {
  return (
    <div className="cloud-list">
      {["S3", "DynamoDB", "Rekognition", "Lambda", "SNS"].map((name) => (
        <div key={name}>
          <span>
            <Cloud size={15} />
            {name === "Lambda" ? "AWS Lambda" : `Amazon ${name}`}
          </span>
          <Badge tone={cloud?.[name] === "Connected" ? "green" : ""}>
            {cloud?.[name] || "Checking…"}
          </Badge>
        </div>
      ))}
    </div>
  );
}
export function SectionTitle({ title, subtitle, action }) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function ActivityList({ activity, limit = 6 }) {
  return activity.length ? (
    <div className="activity-list">
      {activity.slice(0, limit).map((a) => (
        <div key={a.itemId}>
          <span
            className={`activity-dot ${a.level === "error" ? "error" : ""}`}
          />
          <div>
            <strong>{a.message}</strong>
            <p>
              {a.service} · {new Date(a.createdAt).toLocaleString()}
            </p>
          </div>
          <Check size={14} />
        </div>
      ))}
    </div>
  ) : (
    <div className="quiet-state">
      <Cloud size={25} />
      <p>No cloud activity yet.</p>
      <small>Real processing events will appear here.</small>
    </div>
  );
}
