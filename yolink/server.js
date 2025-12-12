import express from "express";
import { config } from "dotenv";
import { fetch as undiciFetch } from "undici";
import path from "node:path";
import { fileURLToPath } from "node:url";

config();

const UAID = process.env.YOLINK_UAID;
const SECRET = process.env.YOLINK_SECRET;
if (!UAID || !SECRET) {
  console.error("Missing YOLINK_UAID or YOLINK_SECRET in .env");
  process.exit(1);
}

const PORT = Number(process.env.PORT || 8787);
const API_HOST = "https://api.yosmart.com";
const app = express();

app.use(express.json());

// In-memory cache (why: reduce auth/device-list chatter)
const cache = {
  accessToken: "",
  refreshToken: "",
  expiresAt: 0,
  devices: /** @type {Array<any>} */ ([]),
  devicesFetchedAt: 0
};

function now() { return Date.now(); }

function isTokenValid() {
  // refresh a little early
  return cache.accessToken && cache.expiresAt - now() > 60_000;
}

async function tokenRequest(params) {
  const body = new URLSearchParams(params).toString();
  const res = await undiciFetch(`${API_HOST}/open/yolink/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) throw new Error(`Token HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

async function ensureAccessToken() {
  if (isTokenValid()) return cache.accessToken;

  if (cache.refreshToken) {
    try {
      const data = await tokenRequest({
        grant_type: "refresh_token",
        client_id: UAID,
        refresh_token: cache.refreshToken
      });
      cache.accessToken = data.access_token;
      cache.refreshToken = data.refresh_token || cache.refreshToken;
      cache.expiresAt = now() + Math.max(0, (data.expires_in || 3600) - 60) * 1000;
      return cache.accessToken;
    } catch {
      // fall through to client_credentials
    }
  }

  const data = await tokenRequest({
    grant_type: "client_credentials",
    client_id: UAID,
    client_secret: SECRET
  });
  cache.accessToken = data.access_token;
  cache.refreshToken = data.refresh_token || "";
  cache.expiresAt = now() + Math.max(0, (data.expires_in || 3600) - 60) * 1000;
  return cache.accessToken;
}

async function yolinkApi(body) {
  const token = await ensureAccessToken();
  const res = await undiciFetch(`${API_HOST}/open/yolink/v2/api`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

async function ensureDevices(force = false) {
  // why: THSensor.getState needs per-device token; we cache the list
  const stale = now() - cache.devicesFetchedAt > 60_000; // 1 min
  if (!force && cache.devices.length && !stale) return cache.devices;
  const resp = await yolinkApi({ method: "Home.getDeviceList" });
  const list = resp?.data?.devices ?? [];
  cache.devices = list;
  cache.devicesFetchedAt = now();
  return list;
}

// ---------- API routes ----------
app.post("/api/signin", async (_req, res) => {
  try {
    await ensureAccessToken();
    res.json({ ok: true, expiresAt: cache.expiresAt });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get("/api/devices", async (_req, res) => {
  try {
    const devices = await ensureDevices();
    res.json({ ok: true, devices });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get("/api/th/:deviceId", async (req, res) => {
  try {
    const { deviceId } = req.params;
    const devices = await ensureDevices();
    const dev = devices.find(d => d.deviceId === deviceId);
    if (!dev) return res.status(404).json({ ok: false, error: "Device not found in account" });
    if (!dev.token) return res.status(400).json({ ok: false, error: "Device has no token (not a TH sensor?)" });

    const resp = await yolinkApi({
      method: "THSensor.getState",
      targetDevice: deviceId,
      token: dev.token
    });

    res.json({ ok: true, response: resp });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ---------- static site ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`YoLink demo running at http://localhost:${PORT}`);
});
