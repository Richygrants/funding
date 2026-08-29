const crypto = require("node:crypto");

const TELEGRAM_API_BASE = "https://api.telegram.org";
const MAX_BODY_BYTES = 30_000;
const MAX_TELEGRAM_MESSAGE_LENGTH = 3900;

const REQUIRED_FIELDS = [
  "fundingType",
  "amount",
  "status",
  "zip",
  "state",
  "age",
  "gender",
  "employment",
  "phone",
  "purpose",
  "urgency",
  "firstName",
  "lastName",
  "email"
];

const FIELD_LABELS = {
  fundingType: "Type of Funding",
  amount: "Funding Amount",
  status: "Citizenship / Residency",
  zip: "ZIP Code",
  state: "State",
  age: "Age",
  gender: "Gender",
  ethnicity: "Ethnicity",
  employment: "Employment Status",
  phone: "Phone",
  purpose: "Message",
  urgency: "Timeline",
  firstName: "First Name",
  lastName: "Last Name",
  email: "Email",
  email2: "Confirm Email",
  consent: "Terms Consent",
  finalConsent: "Final Confirmation"
};

const FIELD_ORDER = [
  "fundingType",
  "amount",
  "status",
  "zip",
  "state",
  "age",
  "gender",
  "ethnicity",
  "employment",
  "phone",
  "purpose",
  "urgency",
  "firstName",
  "lastName",
  "email",
  "email2",
  "consent",
  "finalConsent"
];

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function clean(value, maxLength = 2000) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, maxLength);
}

function humanizeKey(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function labelFor(key) {
  return FIELD_LABELS[key] || humanizeKey(key);
}

function formatValue(value) {
  if (Array.isArray(value)) return value.map((item) => clean(item, 1000)).filter(Boolean).join(", ");
  const cleaned = clean(value, 4000);
  if (cleaned === "on") return "Yes";
  return cleaned || "Not provided";
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  if (body.length > MAX_BODY_BYTES) {
    const error = new Error("Request body is too large.");
    error.statusCode = 413;
    throw error;
  }
  return JSON.parse(body);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeSubmission(input) {
  const data = {};

  for (const [key, value] of Object.entries(input || {})) {
    if (key === "website") continue;
    data[key] = formatValue(value);
  }

  if (data.email) data.email = data.email.toLowerCase();
  if (!data.ethnicity) data.ethnicity = "Prefer not to say";

  data.submittedAt = new Date().toISOString();
  data.submissionId = crypto.randomUUID();

  return data;
}

function validateSubmission(data) {
  const missing = REQUIRED_FIELDS.filter((field) => !data[field] || data[field] === "Not provided");
  if (missing.length) return "Please complete all required fields.";
  if (!isEmail(data.email)) return "Please enter a valid email address.";
  if (data.email2 && data.email2 !== "Not provided" && data.email !== data.email2.toLowerCase()) {
    return "The email addresses do not match.";
  }
  if (!/^\d{5}$/.test(data.zip)) return "Please enter a valid ZIP code.";
  return "";
}

function orderedEntries(data) {
  const reserved = new Set(["submissionId", "submittedAt"]);
  const ordered = [];
  const used = new Set();

  for (const key of FIELD_ORDER) {
    if (data[key] !== undefined) {
      ordered.push([key, data[key]]);
      used.add(key);
    }
  }

  for (const key of Object.keys(data).sort()) {
    if (!used.has(key) && !reserved.has(key)) ordered.push([key, data[key]]);
  }

  return ordered;
}

function buildTelegramMessage(data) {
  const fullName = [data.firstName, data.lastName].filter(Boolean).join(" ").trim() || "Not provided";
  const lines = [
    "New Website Form Submission",
    "",
    `Full Name: ${fullName}`,
    ...orderedEntries(data).map(([key, value]) => `${labelFor(key)}: ${formatValue(value)}`),
    "",
    `Submitted At: ${data.submittedAt}`,
    `Submission ID: ${data.submissionId}`
  ];

  return lines.join("\n");
}

function splitMessage(message) {
  if (message.length <= MAX_TELEGRAM_MESSAGE_LENGTH) return [message];

  const chunks = [];
  let current = "";
  for (const line of message.split("\n")) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > MAX_TELEGRAM_MESSAGE_LENGTH) {
      if (current) chunks.push(current);
      current = line.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH);
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function sendTelegramMessage(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    const error = new Error("Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Netlify environment variables.");
    error.code = "TELEGRAM_CONFIG_MISSING";
    throw error;
  }

  const messages = splitMessage(message);
  const results = [];

  for (const text of messages) {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      const error = new Error(result.description || "Telegram notification failed.");
      error.code = "TELEGRAM_SEND_FAILED";
      error.statusCode = response.status;
      error.telegramDescription = result.description || "";
      throw error;
    }
    results.push(result.result);
  }

  return results;
}

function publicTelegramError(error) {
  const description = clean(error.telegramDescription || error.message || "");

  if (error.statusCode === 401 || /unauthorized/i.test(description)) {
    return "Telegram rejected the bot token. Please check TELEGRAM_BOT_TOKEN in Netlify environment variables.";
  }

  if (/chat not found/i.test(description)) {
    return "Telegram could not find the chat. Open Telegram, send /start to your bot, then check TELEGRAM_CHAT_ID in Netlify environment variables.";
  }

  if (error.statusCode === 403 || /bot was blocked|forbidden/i.test(description)) {
    return "Telegram could not message this chat. Make sure you have started the bot and have not blocked it.";
  }

  if (/too many requests/i.test(description)) {
    return "Telegram is rate-limiting submissions right now. Please try again shortly.";
  }

  return "Telegram could not receive the application. Please check your bot token and chat ID in Netlify.";
}

async function handleApplicationSubmission({ method, body }) {
  if (method !== "POST") {
    return json(405, { ok: false, message: "Method not allowed." });
  }

  let parsed;
  try {
    parsed = parseBody(body);
  } catch (error) {
    return json(error.statusCode || 400, { ok: false, message: "Invalid submission." });
  }

  if (clean(parsed.website)) return json(200, { ok: true });

  const data = normalizeSubmission(parsed);
  const validationMessage = validateSubmission(data);
  if (validationMessage) return json(400, { ok: false, message: validationMessage });

  try {
    const result = await sendTelegramMessage(buildTelegramMessage(data));
    return json(200, { ok: true, id: data.submissionId, messagesSent: result.length });
  } catch (error) {
    if (error.code === "TELEGRAM_CONFIG_MISSING") {
      return json(503, { ok: false, message: error.message });
    }

    return json(502, {
      ok: false,
      message: error.code === "TELEGRAM_SEND_FAILED"
        ? publicTelegramError(error)
        : "Your application could not be submitted right now. Please try again shortly.",
      detail: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

module.exports = {
  buildTelegramMessage,
  handleApplicationSubmission,
  normalizeSubmission,
  validateSubmission
};
