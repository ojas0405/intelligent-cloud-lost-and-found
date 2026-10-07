import { useEffect, useRef, useState } from "react";
import {
  UploadCloud,
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  ImagePlus,
  X,
  Cloud,
  Search,
} from "lucide-react";
import { request, post } from "../services/api";
import { Badge, Timeline } from "../components/Shared";
const categories = [
  "Electronics",
  "Wallet",
  "Keys",
  "Bag",
  "Bottle",
  "ID Card",
  "Clothing",
  "Accessories",
  "Books",
  "Other",
];
const locations = [
  "Library",
  "CSE Block",
  "Cafeteria",
  "Auditorium",
  "Parking",
  "Lab",
  "Classroom",
  "Hostel",
  "Ground",
  "Other",
];
export default function Report({ type, cloud, onComplete, onMatches }) {
  const [file, setFile] = useState(null),
    [preview, setPreview] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [item, setItem] = useState(null),
    [uploading, setUploading] = useState(false);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function pick(f) {
    if (
      f &&
      (!["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
        f.size > 5 * 1024 * 1024)
    ) {
      setError("Choose a JPG, PNG or WEBP image up to 5 MB.");
      return;
    }
    setError("");
    setFile(f);
  }
  async function poll(id) {
    try {
      const r = await request(`/items/${id}`);
      setItem(r.item);
      if (
        r.item.analysisStatus === "FAILED" ||
        r.item.matchingStatus === "FAILED"
      ) {
        setError(r.item.processingError);
        setBusy(false);
        onComplete();
        return;
      }
      if (r.item.matchingStatus === "COMPLETE") {
        setBusy(false);
        onComplete();
        return;
      }
      timer.current = setTimeout(() => poll(id), 1800);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!file) {
      setError("Please upload an image of the item.");
      return;
    }
    setBusy(true);
    setUploading(true);
    try {
      const body = new FormData(e.target);
      body.set("image", file);
      const r = await request(`/items/${type.toLowerCase()}`, {
        method: "POST",
        body,
      });
      setUploading(false);
      setItem(r.item);
      poll(r.item.itemId);
    } catch (e) {
      setError(e.message);
      setBusy(false);
      setUploading(false);
    }
  }
  async function retry() {
    setError("");
    setBusy(true);
    try {
      await post(`/items/${item.itemId}/retry`, {});
      poll(item.itemId);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  const completed = item?.matchingStatus === "COMPLETE";
  return (
    <div className="report-layout">
      <section className="panel report-panel">
        <div className="panel-heading">
          <span className={`square-icon ${type === "LOST" ? "amber" : "blue"}`}>
            <Search size={22} />
          </span>
          <div>
            <h2>
              {type === "LOST"
                ? "Tell us what you lost"
                : "Help an item find its way home"}
            </h2>
            <p>A few details can make all the difference.</p>
          </div>
        </div>
        {item ? (
          <div className="report-success">
            <CheckCircle2 size={45} />
            <h2>
              {type === "LOST" ? "Lost" : "Found"} item reported successfully.
            </h2>
            <p>
              {completed
                ? "Cloud analysis complete."
                : busy
                  ? "AWS is processing your report."
                  : "Your report is saved. Processing needs attention."}
            </p>
            <Timeline status={item.status} />
            <div className="labels">
              {item.detectedLabels.map((l) => (
                <Badge tone="blue" key={l.Name}>
                  {l.Name}
                </Badge>
              ))}
            </div>
            {completed && (
              <div className="success-result">
                <strong>
                  {item.bestMatchScore
                    ? `Best match: ${item.bestMatchScore}%`
                    : "No possible matches found yet."}
                </strong>
                <p>
                  {item.bestMatchScore
                    ? "Review the details and verify ownership."
                    : "New reports can create a match later."}
                </p>
              </div>
            )}
            {completed && (
              <button className="primary" onClick={onMatches}>
                View possible matches <ArrowRight size={16} />
              </button>
            )}
            {!busy && !completed && (
              <button className="primary" onClick={retry}>
                Retry cloud processing
              </button>
            )}
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setItem(null);
                setFile(null);
                setError("");
              }}
            >
              Report another item
            </button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label
              className={`upload-zone ${preview ? "has-preview" : ""}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                pick(e.dataTransfer.files[0]);
              }}
            >
              {preview ? (
                <img src={preview} alt="Selected item preview" />
              ) : (
                <>
                  <ImagePlus size={34} />
                  <strong>Drop an item photo here</strong>
                  <span>or click to browse · JPG, PNG, WEBP · up to 5 MB</span>
                </>
              )}
              <input
                aria-label="Upload item image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => pick(e.target.files[0])}
              />
            </label>
            <div className="form-grid">
              <label className="full">
                Item name
                <input
                  name="itemName"
                  required
                  maxLength={100}
                  placeholder="e.g. Black water bottle"
                />
              </label>
              <label className="full">
                Description
                <textarea
                  name="description"
                  required
                  maxLength={1000}
                  rows={3}
                  placeholder="Describe the brand, size, or anything that stands out…"
                />
              </label>
              <label>
                Category
                <select name="category" required>
                  <option value="">Select category</option>
                  {categories.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Color
                <input
                  name="color"
                  required
                  maxLength={40}
                  placeholder="e.g. Black"
                />
              </label>
              <label className="full">
                {type === "LOST" ? "Last seen location" : "Found location"}
                <select name="location" required>
                  <option value="">Select campus location</option>
                  {locations.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input
                  type="date"
                  name="date"
                  required
                  defaultValue={new Date().toLocaleDateString("en-CA")}
                />
              </label>
              <label>
                Approximate time
                <input type="time" name="time" required />
              </label>
              <label className="full">
                Identifying feature <small>optional · kept private</small>
                <input
                  name="identifyingFeature"
                  maxLength={250}
                  placeholder="A scratch, sticker, or unique marking"
                />
              </label>
              <div className="full form-divider">
                <h3>Ownership verification</h3>
                <p>
                  Set a question only the owner can answer. Answers are stored
                  as salted hashes.
                </p>
              </div>
              <label className="full">
                Ownership question <small>optional</small>
                <input
                  name="ownershipQuestion"
                  maxLength={250}
                  placeholder="e.g. What sticker is on the bottle?"
                />
              </label>
              <label className="full">
                Hidden answer <small>required if you set a question</small>
                <input
                  type="password"
                  autoComplete="off"
                  name="ownershipAnswer"
                  maxLength={250}
                  placeholder="Only used to verify ownership"
                />
              </label>
            </div>
            <div className="form-footer">
              <span>
                <Cloud size={14} /> Securely processed in AWS
              </span>
              <button className="primary" disabled={busy || !cloud?.configured}>
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <UploadCloud size={17} />
                )}
                Submit {type.toLowerCase()} report
              </button>
            </div>
          </form>
        )}
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
      </section>
      <aside>
        <section className="panel workflow-panel">
          <Badge tone="blue">THE CLOUD WORKFLOW</Badge>
          <h2>
            One report.
            <br />A little closer to home.
          </h2>
          <p>Your report goes through a secure, explainable cloud pipeline.</p>
          <div className="workflow">
            {[
              "Uploading image…",
              "Stored in Amazon S3",
              "DynamoDB record saved",
              "Analyzing image…",
              "AI labels detected",
              "Running cloud match…",
              "Possible match found",
            ].map((label, i) => {
              const done =
                i === 0
                  ? Boolean(item)
                  : i <= 2
                    ? Boolean(item)
                    : i <= 4
                      ? item?.analysisStatus === "COMPLETE"
                      : i === 5
                        ? completed
                        : completed && item?.bestMatchScore > 0;
              const active =
                i === 0
                  ? uploading
                  : i === 3
                    ? item?.analysisStatus === "PROCESSING"
                    : i === 5
                      ? item?.matchingStatus === "PROCESSING"
                      : false;
              return (
                <div
                  className={done ? "done" : active ? "active" : ""}
                  key={label}
                >
                  <span>
                    {done ? (
                      <CheckCircle2 size={17} />
                    ) : active ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <strong>{label}</strong>
                </div>
              );
            })}
          </div>
          {!cloud?.configured && (
            <div className="config-note">
              AWS is Not Configured. Follow the project README to enable real
              cloud reports.
            </div>
          )}
          <small>
            Rekognition labels are matching signals. Scores express rule-based
            similarity, not ownership or AI confidence.
          </small>
        </section>
      </aside>
    </div>
  );
}
