// k6 read-API scenario. Works against the Rust API or the read-only fallback.
//
//   k6 run load-tests/api.js -e API_BASE_URL=https://api-staging.example.edu
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const errorRate = new Rate("business_errors");
const base = (__ENV.API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");

export const options = {
  scenarios: {
    reads: {
      executor: "ramping-arrival-rate",
      startRate: 20,
      timeUnit: "1s",
      preAllocatedVUs: 100,
      maxVUs: 600,
      stages: [
        { duration: "10m", target: Number(__ENV.PEAK_RPS || 300) },
        { duration: "20m", target: Number(__ENV.PEAK_RPS || 300) },
        { duration: "5m", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.005"],
    "http_req_duration{expected_response:true}": ["p(95)<250", "p(99)<600"],
    business_errors: ["rate<0.002"],
  },
};

const paths = [
  "/api/v1/clubs?limit=12",
  "/api/v1/projects?limit=12",
  "/api/v1/events?when=upcoming&limit=12",
  "/api/v1/search?q=robotics",
];

export default function () {
  const path = paths[Math.floor(Math.random() * paths.length)];
  const response = http.get(`${base}${path}`, { tags: { route: path.split("?")[0] } });
  const ok = check(response, {
    "status is 200": (res) => res.status === 200,
    "has data": (res) => {
      try {
        return Array.isArray(res.json("data"));
      } catch {
        return false;
      }
    },
    "not rate limited": (res) => res.status !== 429,
  });
  errorRate.add(!ok);
  sleep(0.2 + Math.random() * 0.5);
}
