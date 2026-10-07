# Cloud-processing diagnosis and fix — 6 October 2026

## Confirmed live failures

1. The failed LOST report `395a1330-e798-4742-b514-e92a16a75ddb` initially had `analysisStatus=FAILED`, zero labels and `matchingStatus=PENDING`.
2. Calling Rekognition produced `getaddrinfo ENOTFOUND rekognition.eu-north-1.amazonaws.com`. Stockholm is not listed as a supported Rekognition region in the [official endpoints reference](https://docs.aws.amazon.com/general/latest/gr/rekognition.html).
3. The deployed Lambda `findback-match-items` runs in eu-north-1 with Node.js 24 and `index.handler`, but returns the AWS default `{statusCode:200,body:'"Hello from Lambda!"'}`. Its `AWS_DYNAMODB_TABLE` environment variable is missing and timeout is 3 seconds. Invocation tail logs show START/END/REPORT for that default handler, not matching execution.
4. The actual retry route is `POST /api/items/:id/retry`. It returns `202` with `{message:"Cloud processing queued"}`. The UI then polls `GET /api/items/:id`, expecting `{item:{analysisStatus,matchingStatus,...}}`. Both direct backend and Vite proxy requests returned valid JSON during diagnosis. The reported unreadable response was not reproduced. Development logs do show backend watcher restarts while dependencies change; a proxy failure while the backend is unavailable can return a non-JSON response.
5. Retry also left the previous matching FAILED flag present until after a new image analysis. A polling request could therefore stop immediately. The route now commits fresh PENDING flags before acknowledging the retry, and the processing worker resets matching to PENDING at start.

## Local changes

- `AWS_REKOGNITION_REGION=eu-west-1` added locally and supported in `.env.example`. No credential value or existing resource name changed.
- Rekognition client uses this supported region. The backend reads the existing private S3 image with its existing GetObject permission and sends Bytes to DetectLabels when regions differ. S3, DynamoDB and Lambda remain in eu-north-1. Same-region setups still use S3Object.
- Label output stores only plain `{Name,Confidence}` values; invalid undefined/non-finite entries are discarded. Binary data and SDK metadata are not sent to the frontend.
- Lambda payload decoding uses `Buffer.from(response.Payload).toString("utf-8")`. Plain matching results and valid API Gateway body envelopes are accepted. Empty, double-encoded or default Hello results are rejected with a specific error. Lambda code itself returns a plain object and needs no wrapper.
- Error diagnostics preserve a sanitized operation/error message and never print credentials or entire SDK response objects.
- Existing upload/storage/scoring/UI code remains unchanged apart from retry processing flags.

The backend has been restarted with `npm start` (no development watcher). Real Rekognition analysis succeeded on the existing report and returned `Electronics` and `Headphones`. Matching remains blocked until the real project Lambda is deployed.

## Required AWS console steps

The backend IAM user cannot upload Lambda code: AWS denied `lambda:UpdateFunctionCode`. Role policy inspection was also denied (`iam:ListRolePolicies`). Do these steps using the console identity that created the resources; no new access keys are needed in chat or frontend.

1. Select **eu-north-1** in the AWS console. Open **Lambda → findback-match-items**.
2. Under Code, choose **Upload from → .zip file** and upload **lambda/findback-match.zip** from this project. This ZIP contains `index.js`, `scoring.js`, package files and AWS SDK dependencies at its root. The local project handler already implements matching; the deployed Hello handler must be replaced.
3. Runtime: **Node.js 24.x**; handler: **index.handler**.
4. Configuration → Environment variables: set **AWS_DYNAMODB_TABLE=FindBackItems**, **MATCH_THRESHOLD=55**, **NOTIFICATION_THRESHOLD=80**. Leave **AWS_SNS_TOPIC_ARN** absent/blank. AWS provides AWS_REGION automatically; do not set it manually.
5. Configuration → General configuration: timeout **60 seconds**, memory **256 MB**.
6. Configuration → Permissions → open execution role **findback-match-items-role-wyi2cn7p**. Verify this role allows `dynamodb:GetItem`, `dynamodb:Scan`, `dynamodb:PutItem`, and `dynamodb:UpdateItem` on the exact table ARN. If missing, add the prepared inline policy **infra/findback-lambda-dynamodb-policy.json**. Keep the existing CloudWatch logging permissions.
7. Wait for the Lambda update to finish, then retry the existing report. A successful scan with no FOUND records must produce zero matches, not a fabricated match.
8. View actual logs under **/aws/lambda/findback-match-items**. The correct handler logs JSON `event=matching_complete`, itemId, matchCount and notification. DynamoDB IAM errors, missing table errors or runtime errors must be resolved there if they occur; permissions have not been independently confirmed with the scoped backend user.

## Restart and verify

From the backend directory, stop an old backend with Ctrl+C and run:

```powershell
npm.cmd start
```

Verify connectivity:

```powershell
Invoke-RestMethod "http://localhost:3001/api/cloud/status" | ConvertTo-Json
```

Retry the actual report and inspect HTTP status, Content-Type and JSON body:

```powershell
$response = Invoke-WebRequest -Method Post -Uri "http://localhost:3001/api/items/395a1330-e798-4742-b514-e92a16a75ddb/retry" -ContentType "application/json" -Body '{}'
$response.StatusCode
$response.Headers['Content-Type']
$response.Content
```

Expected immediate response: `202`, `application/json; charset=utf-8`, `{"message":"Cloud processing queued"}`. This only acknowledges queuing, not cloud success. Then check real processing flags:

```powershell
$report = Invoke-RestMethod "http://localhost:3001/api/items/395a1330-e798-4742-b514-e92a16a75ddb"
$report.item | Select-Object itemId,analysisStatus,matchingStatus,processingError,detectedLabels | ConvertTo-Json -Depth 6
```

After deployment, wait for COMPLETE flags. Before deployment, expect successful analysis and a matching failure explaining that the default Lambda handler must be replaced. No labels, matches or successful matching executions are fabricated.
