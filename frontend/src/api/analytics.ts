import axios from "axios";

export async function getAnalyticsInsights(analyticsData: object) {
  const { data } = await axios.post("/api/analytics-insights", { analyticsData });
  return data;
}

export async function getGrowthStrategy(insights: object) {
  const { data } = await axios.post("/api/growth-strategy", { insights });
  return data;
}
