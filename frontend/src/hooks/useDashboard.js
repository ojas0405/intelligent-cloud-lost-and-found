import { useCallback, useEffect, useState } from "react";
import { request } from "../services/api";
export function useDashboard() {
  const [data, setData] = useState({
    items: [],
    matches: [],
    activity: [],
    stats: {
      lost: 0,
      found: 0,
      matches: 0,
      recovered: 0,
      recoveryRate: 0,
      locations: [],
      categories: [],
    },
    cloud: null,
  });
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const results = await Promise.allSettled(
      [
        "/items",
        "/matches",
        "/activity",
        "/dashboard/stats",
        "/cloud/status",
      ].map((p) => request(p)),
    );
    const keys = ["items", "matches", "activity", "stats", "cloud"];
    setData((prev) => {
      const next = { ...prev };
      results.forEach((r, i) => {
        if (r.status === "fulfilled")
          next[keys[i]] = i < 3 ? r.value[keys[i]] : r.value;
      });
      return next;
    });
    setError(
      results.find((r) => r.status === "rejected")?.reason.message || "",
    );
    setLoading(false);
  }, []);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);
  return { ...data, error, loading, refresh };
}
