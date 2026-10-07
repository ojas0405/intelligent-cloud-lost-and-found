import {
  Cloud,
  Database,
  Image,
  ShieldCheck,
  Code2,
  Bell,
  Activity,
  Lock,
  ArrowDown,
  ArrowRight,
  Search,
} from "lucide-react";
const services = [
  ["Amazon S3", "Private object storage for item photos.", Image],
  [
    "Amazon DynamoDB",
    "Item records, matches and application activity.",
    Database,
  ],
  ["Amazon Rekognition", "Image labels that support comparison.", Search],
  ["AWS Lambda", "Serverless matching with six explainable signals.", Code2],
  ["Amazon SNS", "Optional email alerts for strong matches.", Bell],
  ["Amazon CloudWatch", "Real Lambda invocation and error logs.", Activity],
];
export default function Architecture() {
  return (
    <>
      <div className="page-intro">
        <p>Built around the cloud</p>
        <h2>Good technology. Real-world reunions.</h2>
        <span>
          FindBack reconnects people with what they lost, using secure AWS
          services.
        </span>
      </div>
      <section className="panel architecture">
        <h2>A simple, purposeful architecture</h2>
        <div className="architecture-flow">
          <div>People on campus</div>
          <ArrowDown />
          <div>React + Vite frontend</div>
          <ArrowDown />
          <div>Node.js + Express API</div>
          <ArrowDown />
          <div className="cloud-boundary">
            <BadgeText />
            <div className="service-grid">
              {services.map(([name, text, Icon]) => (
                <div key={name}>
                  <Icon size={24} />
                  <h3>{name}</h3>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="security-strip">
          <ShieldCheck size={20} />
          <span>IAM limits service access</span>
          <Lock size={20} />
          <span>Private photos · 5-minute presigned URLs</span>
        </div>
      </section>
      <div className="two-columns">
        <section className="panel">
          <h2>How matching works</h2>
          <p className="muted">
            A transparent 100-point score, computed in AWS Lambda.
          </p>
          <div className="weight-list">
            {[
              ["Category", 25],
              ["Rekognition label overlap", 25],
              ["Color", 15],
              ["Description keywords", 15],
              ["Campus location", 10],
              ["Date & time", 10],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <div>
                  <i style={{ width: `${value * 4}%` }} />
                </div>
                <strong>{value}%</strong>
              </div>
            ))}
          </div>
          <p className="small muted">
            Image labels describe objects; they do not identify an exact product
            or prove ownership. An answer known to the owner provides a separate
            verification step.
          </p>
        </section>
        <section className="panel">
          <h2>Cloud concepts, made visible</h2>
          <div className="concepts">
            {[
              "Object storage",
              "NoSQL database",
              "Serverless computing",
              "AI image analysis",
              "Cloud APIs",
              "IAM access control",
              "Secure temporary file access",
              "Notifications",
              "Monitoring",
            ].map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <p className="muted">
            The backend explicitly invokes Lambda after Rekognition completes.
            This keeps the classroom demo easy to trace. DynamoDB Streams is a
            documented optional extension; it is not enabled in this project.
          </p>
          <p className="small muted">
            Cloud Activity shows application events. Actual Lambda logs stay in
            CloudWatch.
          </p>
        </section>
      </div>
    </>
  );
}
function BadgeText() {
  return (
    <div className="cloud-boundary-title">
      <Cloud size={19} /> AWS CLOUD
    </div>
  );
}
