export async function onRequestPost(context) {
  const { request } = context;
  const botToken = context.env.TELEGRAM_BOT_TOKEN;
  const chatId = context.env.TELEGRAM_CHAT_ID;

  function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (!botToken || !chatId) {
    return jsonResponse(503, { success: false, error: "Server misconfiguration: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set" });
  }

  // helpers (lightweight versions from previous server handler)
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
    "fundingType","amount","status","zip","state","age","gender","ethnicity",
    "employment","phone","purpose","urgency","firstName","lastName","email","email2","consent","finalConsent"
  ];

  const REQUIRED_FIELDS = [
    "fundingType","amount","status","zip","state","age","gender","employment",
    "phone","purpose","urgency","firstName","lastName","email"
  ];

  const MAX_TELEGRAM_MESSAGE_LENGTH = 3900;

  function clean(value, maxLength = 2000) {
    if (value === undefined || value === null) return "";
    return String(value)
      .replace(/\u0000/g, "")
      .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
      .trim()
      .slice(0, maxLength);
  }

  function formatValue(value) {
    if (Array.isArray(value)) return value.map((v) => clean(v, 1000)).filter(Boolean).join(", ");
    const cleaned = clean(value, 4000);
    if (cleaned === "on") return "Yes";
    return cleaned || "Not provided";
  }

  function labelFor(key) {
    return FIELD_LABELS[key] || key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  async function readJsonSafe(req) {
    try {
      return await req.json();
    } catch {
      return null;
    }
  }

  const body = await readJsonSafe(request);
  if (!body) {
    return jsonResponse(400, { success: false, error: "Invalid JSON body" });
  }

  // honeypot (keep same name as in form)
  if (clean(body.website)) {
    // silently accept bots
    return jsonResponse(200, { success: true });
  }

  // Normalize and validate
  const data = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === "website") continue;
    data[k] = formatValue(v);
  }
  if (data.email) data.email = data.email.toLowerCase();
  if (!data.ethnicity) data.ethnicity = "Prefer not to say";
  data.submittedAt = new Date().toISOString();

  const missing = REQUIRED_FIELDS.filter((f) => !data[f] || data[f] === "Not provided");
  if (missing.length) {
    return jsonResponse(400, { success: false, error: "Please complete all required fields." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return jsonResponse(400, { success: false, error: "Please enter a valid email address." });
  }
  if (!/^\d{5}$/.test(data.zip)) {
    return jsonResponse(400, { success: false, error: "Please enter a valid ZIP code." });
  }

  // Build Telegram message
  const fullName = [data.firstName, data.lastName].filter(Boolean).join(" ").trim() || "Not provided";
  const lines = ["🔔 New Website Form Submission", "", `Full Name: ${fullName}`];

  // ordered fields
  const used = new Set();
  for (const key of FIELD_ORDER) {
    if (data[key] !== undefined) {
      lines.push(`${labelFor(key)}: ${formatValue(data[key])}`);
      used.add(key);
    }
  }
  // any other fields alphabetically
  for (const key of Object.keys(data).sort()) {
    if (used.has(key) || key === "submittedAt") continue;
    lines.push(`${labelFor(key)}: ${formatValue(data[key])}`);
  }
  lines.push("", `Submitted At: ${data.submittedAt}`);

  const message = lines.join("\n");

  // split message into chunks if needed
  function splitMessage(text) {
    if (text.length <= MAX_TELEGRAM_MESSAGE_LENGTH) return [text];
    const chunks = [];
    let cur = "";
    for (const line of text.split("\n")) {
      const candidate = cur ? `${cur}\n${line}` : line;
      if (candidate.length > MAX_TELEGRAM_MESSAGE_LENGTH) {
        if (cur) chunks.push(cur);
        cur = line.slice(0, MAX_TELEGRAM_MESSAGE_LENGTH);
      } else {
        cur = candidate;
      }
    }
    if (cur) chunks.push(cur);
    return chunks;
  }

  try {
    const parts = splitMessage(message);
    for (const text of parts) {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: context.env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true })
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || (j && j.ok === false)) {
        const detail = (j && j.description) || `${res.status} ${res.statusText}`;
        // map common Telegram errors to friendly messages
        if (res.status === 401) return jsonResponse(502, { success: false, error: "Telegram rejected the bot token. Check TELEGRAM_BOT_TOKEN in Pages environment variables.", detail });
        if (res.status === 403) return jsonResponse(502, { success: false, error: "Telegram could not message this chat (bot blocked or not started). Check TELEGRAM_CHAT_ID.", detail });
        return jsonResponse(502, { success: false, error: "Telegram API error", detail });
      }
    }

    return jsonResponse(200, { success: true });
  } catch (err) {
    return jsonResponse(500, { success: false, error: err.message || "Internal error" });
  }
}
