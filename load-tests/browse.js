// k6 public-browsing scenario. See docs/LOAD_TEST_PLAN.md.
//
//   k6 run load-tests/browse.js -e BASE_URL=https://staging.example.edu \
//     -e RAMP_UP=10m -e HOLD=30m
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const errorRate = new Rate("business_errors");
const base = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const rampUp = __ENV.RAMP_UP || "10m";
const hold = __ENV.HOLD || "30m";
const peak = Number(__ENV.PEAK_VUS || 3000);

export const options = {
  scenarios: {
    browsing: {
      executor: "ramping-vus",
      startVUs: 50,
      stages: [
        { duration: rampUp, target: peak },
        { duration: hold, target: peak },
        { duration: "5m", target: 0 },
      ],
      gracefulRampDown: "2m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.005"],
    "http_req_duration{expected_response:true}": ["p(95)<400", "p(99)<1200"],
    business_errors: ["rate<0.002"],
  },
  discardResponseBodies: false,
};

const paths = [
  "/",
  "/clubs",
  "/events",
  "/projects",
  "/about",
  "/search?q=robotics",
  "/clubs/robotics-society",
  "/events/intro-to-soldering-workshop",
  "/projects/solar-charging-bench-for-the-courtyard",
];

export default function () {
  const path = paths[Math.floor(Math.random() * paths.length)];
  const response = http.get(`${base}${path}`, { tags: { route: path } });
  const ok = check(response, {
    "status is 200": (res) => res.status === 200,
    "is html": (res) => String(res.headers["Content-Type"] || "").includes("text/html"),
    "not an error page": (res) => !String(res.body || "").includes("We couldn't render this page"),
  });
  errorRate.add(!ok);
  sleep(2 + Math.random() * 4);
}
