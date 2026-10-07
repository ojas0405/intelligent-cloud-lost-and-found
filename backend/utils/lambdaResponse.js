export function decodeMatchResponse(response) {
  if (!response.Payload?.length)
    throw new Error("Matching Lambda returned an empty response.");
  const payload = JSON.parse(Buffer.from(response.Payload).toString("utf-8"));
  if (response.FunctionError) {
    const error = new Error(payload.errorMessage || "Matching Lambda failed.");
    error.name = payload.errorType || "LambdaFunctionError";
    throw error;
  }
  const result =
    payload && typeof payload === "object" && "statusCode" in payload
      ? typeof payload.body === "string"
        ? JSON.parse(payload.body)
        : payload.body
      : payload;
  if (payload?.statusCode >= 400)
    throw new Error("Matching Lambda returned a failed status.");
  if (!result || typeof result !== "object" || !Array.isArray(result.matches)) {
    throw new Error(
      "Matching Lambda returned an unexpected response. Deploy the FindBack matching package; the default Hello from Lambda handler cannot match items.",
    );
  }
  return result;
}
