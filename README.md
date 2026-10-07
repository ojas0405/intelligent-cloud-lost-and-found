# FindBack — Intelligent Cloud Lost & Found

**Reconnect people with what they lost.** A complete college project with a React dashboard, Node/Express API and an AWS Lambda matching engine. AWS is the real storage and processing layer. No fake data, labels, connectivity or cloud execution is used in the application.

## What's included

Dashboard with live calculated statistics, location and category charts, lost/found reports, validated image uploads, Rekognition label chips, processing timeline, side-by-side matches with six-part score explanations, ownership questions with salted hashes, claim/verify/return workflow, search/filter/sort, private image viewing, report deletion, retry controls, activity feed and HTML/CSS architecture diagram.

Stack: React 19, Vite, plain CSS, Lucide React, Recharts, Node.js 24+, Express 5, AWS SDK v3, Multer and Sharp. Sharp validates decoded image content, removes metadata, resizes oversized images and converts uploads to JPEG. There is no Docker, microservices system or complex authentication.

## Start locally — two terminals

Install Node.js 24 LTS. Open PowerShell in the `findback` folder.

Terminal 1:

```powershell
cd backend
npm install
Copy-Item .env.example .env
# Fill .env only when AWS resources are ready. An empty AWS configuration is supported.
npm run dev
```

Terminal 2, starting from `findback`:

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. API runs at **http://localhost:3001**. Keep both terminals running. The Vite proxy forwards `/api` to the backend. If PowerShell blocks the npm script, use `npm.cmd` instead of `npm`; no execution-policy change is needed. A custom API port also requires updating the Vite proxy.

Without AWS the UI starts, statistics are zero, reports/matches/activity are empty, and services show **Not Configured**. Submissions are disabled and mutation APIs return HTTP 503. There is no in-memory production imitation. Never place AWS credentials in `frontend` or any `VITE_` variable.

## Exact AWS setup

Use one AWS account and one supported region for S3, DynamoDB, Rekognition, Lambda and optional SNS. `us-east-1` is a straightforward choice; verify availability in the [AWS service region reference](https://docs.aws.amazon.com/general/latest/gr/rekognition.html). Resource usage may incur AWS charges. This guide creates resources manually so you can explain each service during your viva.

### 1. S3: private image storage

1. Open **S3 → Create bucket**. Select a general purpose bucket, give it a globally unique name such as `findback-yourname-2026`, and choose your region.
2. Leave **Block all public access** ON. Leave ACLs disabled / Bucket owner enforced. Keep default encryption, SSE-S3.
3. Create the bucket and note its exact name and region. No public bucket policy, website hosting or S3 CORS is needed: uploads go through Express and images use signed GET URLs.
4. `lost/` and `found/` prefixes are created on upload automatically. Do not manually add public permissions.

### 2. DynamoDB: one simple table

1. Open **DynamoDB → Tables → Create table** in the same region.
2. Table name **FindBackItems**. Partition key **itemId**, type **String**. No sort key or secondary index.
3. Choose on-demand capacity, leave other defaults, create and wait until Active.
4. The table holds `ITEM`, `MATCH` and `ACTIVITY` records distinguished by `entity`. Reports use UUID keys; matches use `MATCH#lostUUID#foundUUID`; activities use `ACTIVITY#UUID`.

### 3. CloudWatch: create the log group first

1. Open **CloudWatch → Logs → Log groups → Create log group**.
2. Name it **/aws/lambda/FindBackMatchItems** in your selected region.
3. Set a retention such as 7 days. Creating it first allows a narrow Lambda role with no account-wide CreateLogGroup permission.

### 4. IAM: Lambda execution role

1. Open **IAM → Roles → Create role → AWS service → Lambda**. Name it **FindBackMatchRole**. Do not attach AdministratorAccess.
2. For the role trust relationship use [infra/lambda-trust.json](infra/lambda-trust.json).
3. Add an inline policy from [infra/lambda-policy.json](infra/lambda-policy.json). Replace `YOUR_REGION` and `YOUR_ACCOUNT_ID` with your actual values. The DynamoDB table name must match your chosen name.
4. This role can read/update the project table and write to its specific CloudWatch log group. Lambda does not need S3 or Rekognition permissions because Express handles image analysis.
5. If SNS is used, add `sns:Publish` scoped to your exact topic ARN to this role. See the SNS section below.

### 5. Package and deploy the Lambda

From `findback`:

```powershell
cd lambda/matchItems
npm install
cd ../..
npm install
npm run package:lambda
```

1. Open **Lambda → Create function → Author from scratch**.
2. Function name **FindBackMatchItems**, runtime **Node.js 24.x**, architecture **x86_64**.
3. Select existing execution role **FindBackMatchRole**.
4. Open Code → Upload from → .zip file, select **lambda/findback-match.zip**. Handler is **index.handler**. The ZIP must contain `index.js`, `scoring.js`, `package.json` and `node_modules` at its root.
5. Configuration → General configuration: timeout **60 seconds**, memory **256 MB**. This project uses a table scan suited to a small campus assignment, not large-scale matching.
6. Configuration → Environment variables: `AWS_DYNAMODB_TABLE=FindBackItems`, `MATCH_THRESHOLD=55`, `NOTIFICATION_THRESHOLD=80`. Optionally set `AWS_SNS_TOPIC_ARN`.
7. Do not manually set `AWS_REGION` inside Lambda; AWS supplies this reserved variable. Do not put access keys into Lambda; it uses its execution role.
8. The backend invokes Lambda explicitly after Rekognition finishes, with `{"itemId":"UUID_OF_ANALYZED_REPORT"}`. No trigger needs to be configured. This is the reliable permitted invocation design; DynamoDB Streams and S3 triggers are not active.

The current runtime is documented by [AWS Lambda Node.js documentation](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html). All SDK dependencies are packaged rather than relying on a particular SDK version bundled by AWS.

### 6. Rekognition

1. Confirm your selected region supports Rekognition. No model training or custom collection is required.
2. The backend calls **DetectLabels** against the S3 object in the same region, with up to 12 labels and minimum confidence 65. This confidence belongs to the Rekognition label, never to the overall match score.
3. Rekognition supports JPEG/PNG; this project accepts JPG/PNG/WEBP and converts all uploaded photos to JPEG before storage. [AWS image requirements](https://docs.aws.amazon.com/rekognition/latest/dg/images-information.html).
4. Credentials must allow `rekognition:DetectLabels` and `s3:GetObject` for these objects. The status panel says **Configured · verified on upload** until a real analysis occurs, rather than claiming a successful health check.

### 7. IAM: dedicated local backend credentials

1. IAM → Users → Create user: **FindBackLocalBackend**. Do not give console access unless independently needed.
2. Add an inline policy from [infra/backend-policy.json](infra/backend-policy.json), replacing `YOUR_BUCKET`, `YOUR_REGION`, `YOUR_ACCOUNT_ID` and resource names if changed.
3. The policy allows only the two image prefixes, table operations, DetectLabels and invoking/inspecting this specific Lambda. DetectLabels requires `Resource: "*"` because this operation has no resource-scoped ARN. `DescribeTable` and `GetFunctionConfiguration` are used by genuine status checks.
4. Security credentials → Create access key → Local code. Copy the access key and secret once into `backend/.env`. Never share or commit this file.
5. If using temporary credentials, supply `AWS_SESSION_TOKEN`; for normal IAM keys leave it blank. The standard SDK credential provider chain also supports a configured AWS profile or workload role; explicit keys are not compulsory.
6. Local backend binds to 127.0.0.1. CORS is restricted to `FRONTEND_URL`. There is no identity/login system; this is intended for a trusted local classroom demonstration, not an anonymous public deployment.

Claims use DynamoDB transactional writes; IAM authorizes the individual `UpdateItem` actions in those transactions. No separate `dynamodb:TransactWriteItems` policy action is needed.

### 8. Optional SNS email

1. SNS → Topics → Create topic → **Standard**, name **FindBackMatches**.
2. Topic → Create subscription → protocol **Email**, enter your email and confirm the subscription from your inbox.
3. Put the topic ARN into Lambda environment `AWS_SNS_TOPIC_ARN` and `backend/.env`.
4. Add `sns:Publish` for this ARN to the Lambda role. Add `sns:GetTopicAttributes` for this ARN to the backend policy for the optional connection check:

```json
{"Effect":"Allow","Action":"sns:Publish","Resource":"arn:aws:sns:YOUR_REGION:YOUR_ACCOUNT_ID:FindBackMatches"}
```

```json
{"Effect":"Allow","Action":"sns:GetTopicAttributes","Resource":"arn:aws:sns:YOUR_REGION:YOUR_ACCOUNT_ID:FindBackMatches"}
```

5. Scores at or above 80 generate a topic message. An SNS publish success means AWS accepted the message, not that email delivery was independently verified. SNS failure does not discard a match. Leaving the ARN blank keeps SNS optional and all other features work. Matches always appear in-app.

### 9. Configure backend/.env

```dotenv
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=YOUR_LOCAL_BACKEND_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=YOUR_LOCAL_BACKEND_SECRET
AWS_SESSION_TOKEN=
AWS_S3_BUCKET_NAME=YOUR_PRIVATE_BUCKET_NAME
AWS_DYNAMODB_TABLE=FindBackItems
AWS_MATCH_LAMBDA_NAME=FindBackMatchItems
AWS_SNS_TOPIC_ARN=
PORT=3001
FRONTEND_URL=http://localhost:5173
MATCH_THRESHOLD=55
NOTIFICATION_THRESHOLD=80
```

Thresholds must be configured on Lambda, which owns scoring and notifications; the backend example includes them for consistency but does not override Lambda settings. Restart the backend after editing `.env`. Do not leave placeholder access keys in the file; remove key fields when using a profile/role. All resources and credentials stay on the backend.

### 10. Verify connectivity and logs

Open Cloud Activity: S3, DynamoDB and Lambda are checked with real AWS API calls. Missing config is **Not Configured**, denied/wrong resources are **Unavailable (error name)**. SNS is **Optional** if omitted. A connected Lambda status confirms the function exists and is accessible, not a successful match execution.

After a report, open **Lambda → FindBackMatchItems → Monitor → View CloudWatch logs**, or **CloudWatch → Logs → /aws/lambda/FindBackMatchItems → latest stream**. Find `START`, `END`, `REPORT`, and JSON `matching_complete` with itemId and matchCount. An exception appears in the same stream. No secret answers or credentials are logged.

## Exact classroom live demo

1. Start both terminals; open FindBack and Cloud Activity. Show actual connected S3, DynamoDB and Lambda status.
2. Use the bottle pair from [demo/PAIRS.md](demo/PAIRS.md). Prepare your own photo of a black bottle with a blue star sticker.
3. Report LOST: name, description, Bottle, Black, Library, demo date, 10:30, photo, ownership question “What sticker is on the bottle?”, hidden answer “blue star”.
4. Submit. The browser uploads to Express; successful response proves S3 storage and DynamoDB record creation. Watch polling reveal real Rekognition labels and Lambda completion. Expect no match if no found items exist.
5. Open S3 → your private bucket → lost/ and show the object exists. The object is not public. Open DynamoDB → Explore table items and show the ITEM record and detectedLabels. The ownership answer is a salted hash.
6. Report FOUND: same object/details, CSE Block, same date, 11:00 and a photo. Do not set a public description containing the secret verification detail if it should remain confidential; use a different undisclosed question for a real ownership check.
7. Wait for AWS processing and the score. Open Matches and explain the six point contributions. Scores depend on actual image labels; never promise a fabricated percentage.
8. Request Claim, demonstrate a wrong answer without revealing the expected answer, then provide the correct answer. Show Ownership verified.
9. Physically return the object and click Mark as returned. Both reports and the match update transactionally.
10. Return to Dashboard: recovered count and lost-item recovery rate update. Returned pairs no longer count as active possible matches.
11. Show Cloud Activity application events and actual Lambda CloudWatch log separately.
12. Optional: show the confirmed SNS subscriber email for a sufficiently high score. A retry may publish another notification; this simple demo does not provide exactly-once notifications.

The matched bottle's expected score is 97 only if useful image-label sets are identical. The UI never substitutes that illustrative score.

## APIs

| Method | Endpoint | Behavior |
|---|---|---|
| GET | /api/health | Local backend health |
| GET | /api/items | Search, filter, sort; empty without AWS |
| GET | /api/items/:id | Safe report record |
| POST | /api/items/lost or /found | Multipart report with image; 202 while processing |
| POST | /api/items/:id/retry | Reprocess failed reports |
| DELETE | /api/items/:id | Delete image/report/matches, recompute related scores |
| GET | /api/items/:id/image-url | Presigned S3 GET URL, expires in 300 seconds |
| GET | /api/matches or /matches/:itemId | Safe match explanations and paired items |
| POST | /api/claims/:itemId | `{matchId}`; receive question and opaque claim token |
| POST | /api/claims/:itemId/verify | `{matchId,claimToken,answer}` |
| POST | /api/claims/:itemId/returned | `{matchId,claimToken}` after verification |
| POST | /api/claims/:itemId/cancel | Release an unverified claim; token required unless expired |
| GET | /api/cloud/status | Real resource checks; explicit pending configuration |
| GET | /api/dashboard/stats | Computed totals, distributions and recovery rate |
| GET | /api/activity | Latest 100 application AWS events |

`GET /api/items?search=bottle&filter=LOST&sort=newest` accepts filters LOST, FOUND, MATCHED, RETURNED; sort newest, oldest, score. No permanent image URLs are stored. UI refreshes private viewing links every 4 minutes.

## Validation, matching and recovery

Uploads: one JPG/JPEG, PNG or WEBP, max 5 MB; real decoding and a 25-million-pixel cap. Text inputs have server-enforced limits. Dates and times are validated. Images are normalized to JPEG under logical prefixes. Failed database creation attempts S3 rollback.

Matching weights: category 25, useful-label Jaccard overlap 25, normalized exact color 15, description/name keyword Jaccard overlap 15, same location 10 or predefined nearby location 7, time difference ≤2h 10, ≤24h 7, ≤72h 4, otherwise 0. Generic Person/Human/Indoors/Outdoors labels are excluded. No evidence earns no points; weights are never silently reallocated. Unknown “Other” category/location earns no equality points. Time comparisons assume one campus timezone; stored date/time remain local strings.

Top five opposite-type candidates above threshold are persisted as unique pair records. Both items get symmetric match links and best scores. Claim/verify/return use conditional DynamoDB transactions and an opaque 15-minute session token. Answers are normalized and stored using random-salt scrypt hashes; neither answer hashes nor private identifying features appear in public APIs. Answer attempts are rate limited. Items without a question cannot auto-verify; the UI explains that coordinator verification is needed. A full coordinator/admin workflow is out of scope.

## Tests and packaging

From `findback`:

```powershell
npm --prefix frontend run build
npm --prefix lambda/matchItems install
npm --prefix backend test
npm install
npm run package:lambda
```

See [VERIFICATION.md](VERIFICATION.md) for checks actually run and limitations. See [ARCHITECTURE.md](ARCHITECTURE.md) for schemas and decisions. Keep lockfiles for reproducible installs; use `npm ci` after cloning.

## GitHub safety

`.env`, node_modules, dist, ZIPs and logs are ignored. `.env.example` contains no keys. Before any push, run the included scanner:

```powershell
node scripts/secret-scan.js
```

It scans project source excluding ignored generated folders and `.env`, and blocks recognizable AWS access key IDs and non-placeholder secret assignments. Also manually review `git diff --cached`; a basic pattern scanner is not comprehensive secret detection. No repository push is part of this delivery.

## Limitations and troubleshooting

- No live AWS credentials were supplied; real cloud deployment is a manual step. Local tests with injected AWS responses are clearly test fixtures, not proof of cloud access.
- This is a trusted local classroom app. CORS is not authentication. Do not expose the unauthenticated report deletion/claim APIs on the public Internet without login, authorization, HTTPS and stronger abuse controls.
- Processing runs in the persistent Express process with explicit Lambda invocation. If Express stops after saving a report, the item remains pending; restart and use retry. A queue/stream worker is an optional future extension. AWS logs and activity distinguish completed stages.
- Scans and per-report processing suit a small demo. No distributed matching lock or fully serialized claim/match concurrency is implemented. Claims themselves lock both paired items transactionally. Run the classroom reports sequentially.
- Claim tokens are saved in browser sessionStorage; use the same tab to finish. Unverified expired claims can be released/re-requested. Verified sessions that expire before return require coordinator intervention in DynamoDB; complete return promptly during the demo.
- Deletion across S3 and DynamoDB is not one transaction; if interrupted, inspect/clean orphan objects or match records in the console. Database writes do not roll back a completed image analysis.
- Public descriptions can accidentally reveal a challenge answer. Choose a private ownership detail that isn't in the photo or public description. The illustrative bottle sticker demonstrates flow, not robust identity security.
- SNS is a shared demo topic, not individualized subscriptions. Duplicate notifications may occur on retries. No SMS required.
- Activity rows have no TTL, frontend lists scan the small table, and no pagination UI is included. For a larger deployment, add indexed queries, retention and pagination.
- Missing credentials/wrong region/permissions return clean errors. Check your region, IAM ARNs, actual resource names and CloudWatch. Rekognition/S3 must share a region. Pending analysis is never replaced with invented labels.
- S3 viewing URLs expire after 5 minutes and refresh in the UI; a copied expired link is expected to fail.

## 60-second faculty explanation

“FindBack is an intelligent lost and found system for our campus. I built the frontend with React and the backend with Node.js and Express. When someone reports an item, the backend stores its photo privately in Amazon S3 and its details in DynamoDB. Amazon Rekognition detects image labels. An AWS Lambda function compares lost and found records using category, image labels, color, description, location and time. It returns a match score and explains the points. The owner answers a private question before we mark the item returned. Amazon SNS can send an email when a strong match appears. IAM gives each component only the access it needs, and short-lived presigned URLs let us view private photos. CloudWatch stores actual Lambda logs. The dashboard makes the cloud workflow and recovery results visible.”
