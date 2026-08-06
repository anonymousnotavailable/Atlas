// Web Push — the actual delivery mechanism for the morning briefing.
// Deliberately NOT Firebase Cloud Messaging: FCM needs a Firebase project +
// service account credential, another thing for Prathmesh to go set up. Web
// Push (RFC 8030) is a browser standard — Chrome/Firefox/Edge/Safari all
// speak it natively via each browser vendor's own free push service, no
// third-party account needed at all. The only "credential" is a VAPID
// keypair, which this module generates itself on first boot.

const webpush = require("web-push");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const KEYS_PATH = path.join(DATA_DIR, "vapid-keys.json");
const SUBS_PATH = path.join(DATA_DIR, "push-subscriptions.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// VAPID keys must stay stable across restarts — a subscription the browser
// made against one public key breaks if the server starts handing out a
// different one later. Generate once, persist, reuse forever after.
function loadOrCreateVapidKeys() {
  ensureDataDir();
  if (fs.existsSync(KEYS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(KEYS_PATH, "utf8"));
    } catch (_) {
      // fall through and regenerate if the file is corrupt
    }
  }
  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(KEYS_PATH, JSON.stringify(keys, null, 2));
  return keys;
}

const vapidKeys = loadOrCreateVapidKeys();
const subject = process.env.VAPID_SUBJECT || "mailto:atlas@localhost";
webpush.setVapidDetails(subject, vapidKeys.publicKey, vapidKeys.privateKey);

function loadSubscriptions() {
  ensureDataDir();
  if (!fs.existsSync(SUBS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(SUBS_PATH, "utf8"));
  } catch (_) {
    return [];
  }
}

function saveSubscriptions(subs) {
  ensureDataDir();
  fs.writeFileSync(SUBS_PATH, JSON.stringify(subs, null, 2));
}

function getPublicKey() {
  return vapidKeys.publicKey;
}

function addSubscription(subscription) {
  if (!subscription || !subscription.endpoint) throw new Error("Invalid subscription object.");
  const subs = loadSubscriptions();
  if (!subs.some((s) => s.endpoint === subscription.endpoint)) {
    subs.push(subscription);
    saveSubscriptions(subs);
  }
}

function removeSubscription(endpoint) {
  const subs = loadSubscriptions().filter((s) => s.endpoint !== endpoint);
  saveSubscriptions(subs);
}

function hasSubscriptions() {
  return loadSubscriptions().length > 0;
}

// Sends payload (an object — gets JSON-stringified) to every subscribed
// device. Dead subscriptions (browser revoked it, device unenrolled) come
// back as 404/410 from the push service — pruned automatically so the list
// doesn't accumulate junk.
async function sendToAll(payload) {
  const subs = loadSubscriptions();
  if (subs.length === 0) return { sent: 0, pruned: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  const dead = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, body);
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) dead.push(sub.endpoint);
        // other errors (network blip, temporary push-service failure) are
        // left alone — not the subscription's fault, don't prune it
      }
    })
  );

  if (dead.length) saveSubscriptions(loadSubscriptions().filter((s) => !dead.includes(s.endpoint)));
  return { sent, pruned: dead.length };
}

module.exports = { getPublicKey, addSubscription, removeSubscription, hasSubscriptions, sendToAll };
