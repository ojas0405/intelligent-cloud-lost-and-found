# Verification — 6 October 2026

## Completed locally

| Check | Result |
|---|---|
| Dependency installation | Frontend, backend, Lambda and packaging dependencies installed; lockfiles included |
| Frontend production build | PASS — Vite build; application and charts split into separate bundles |
| Backend startup | PASS — API listens on localhost:3001 |
| Backend tests | PASS — 15 tests, zero failures |
| JavaScript syntax | PASS — backend/Lambda/script source files checked with Node; frontend JSX/imports checked by Vite |
| Missing AWS configuration | PASS — empty datasets, zero calculated metrics, explicit Not Configured states; cloud writes return 503 |
| Image processing | PASS — actual Sharp decoding/normalization executed in tests; invalid image rejected |
| Cloud API wiring | PASS with test doubles — S3 PutObject, Rekognition DetectLabels and Lambda Invoke are called through real application routes |
| Lambda logic | PASS with test doubles — real handler stores one explained pair, symmetric references and best scores; duplicate pair prevented on retry |
| Score rules | PASS — identical, unrelated, missing-label, nearby-location and time cases checked |
| Claims | PASS with test doubles — token required, wrong answer rejected, verified return updates both reports, competing claim blocked |
| Cloud errors | PASS with test doubles — Rekognition failure stores FAILED and never invokes Lambda |
| Validation and secret protection | PASS — invalid calendar dates/categories rejected; normalized answers verify; salted hashes differ and are omitted from API records |
| UI navigation | PASS in browser — dashboard, Report Lost, Report Found, Matches, All Items, Cloud Activity and Architecture inspected |
| Search/filter/sort | PASS in browser — controls change correctly and display honest empty filtered state |
| Responsive layout | PASS in browser — default laptop viewport and 390 × 844 phone viewport inspected; no horizontal overflow; mobile menu navigates |
| Browser errors | No console errors or warnings observed during checked states |
| Dependency audit | Install audits report zero known vulnerabilities for all four packages after upgrading Sharp to 0.35.5 |
| Source secret scan | PASS — no recognizable AWS access keys or populated secret assignments found |
| Lambda ZIP | Deployment ZIP generated with handler, scorer and AWS SDK dependencies |

The npm registry initially could not be reached from the restricted execution environment. Installation and Vite build were completed with approved execution access. No dependency install failure remains. Optional esbuild/Sharp lifecycle scripts were blocked by the host's package controls; installed prebuilt binaries worked and the real build/image tests passed.

Screenshots: `../findback-dashboard.jpg` and `../findback-mobile.jpg` show the actual local app without AWS configuration. The illustrated backpacks in the dashboard hero are decorative branding, not stored reports or inferred matches.

## Not tested against a real AWS account

No AWS credentials or cloud resources were supplied. Therefore actual S3 access/privacy, DynamoDB writes/transactions, Rekognition outputs, deployed Lambda invocation, CloudWatch log creation, IAM policy enforcement and SNS email delivery remain unverified in AWS. Test doubles are confined to backend test files and never form an app fallback.

After completing the exact AWS setup in README, use the classroom demo checklist to verify each service. Preserve Block Public Access on S3 and confirm SNS subscriptions before expecting email.

## Practical limits

This delivery uses the allowed explicit backend-to-Lambda invocation. No S3 trigger, DynamoDB Stream or EventBridge schedule is deployed. No authentication or coordinator administration is implemented; the API binds to localhost for the intended demonstration. Scores are explainable similarity points and never AI probabilities. Dataset scans suit a small project. Express processing is not a durable queue, SNS is not exactly-once delivery, and cross-service deletion is not atomic. These limits and recovery instructions are documented in README.
