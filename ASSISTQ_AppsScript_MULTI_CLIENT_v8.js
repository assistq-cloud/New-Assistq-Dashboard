/**
 * AssistQ / SonQAI Backend — v4 (Real Estate scoring + Funnel reporting)
 * -------------------------
 * NEW IN THIS VERSION:
 * 1. NUMERIC WEIGHTED LEAD SCORE (out of 100) — instead of just Hot/Warm/
 *    Cold from one field, this scores Budget, Requirement, Timeline,
 *    Location fit, and Intent separately and adds them up, e.g. 90/100.
 * 2. FUNNEL-STYLE WEEKLY REPORT — breaks down by traffic source showing
 *    Leads → Qualified → Hot counts, like a real acquisition report.
 *
 * Chat, FAQ, memory, error alerts, UTM capture all work exactly as before.
 */

// ============ CONFIG — edit this per client ============
const TEST_MODE = false;

const CONFIG = {
  dashboardUrl: "https://app.assistq.in", // Fallback only; Script Properties should override this in production.
  clientEmail: "assistiq1@gmail.com",
  clientWhatsApp: "918446242738",
  businessName: "ASSISTQ",
  sheetName: "Leads",

  // Real-estate-tailored question set. Add "options" for quick-reply
  // buttons in the widget — keep the widget's questions array in sync.
  questions: [
    { key: "name",   label: "What's your name?" },
    { key: "phone",  label: "What's the best phone number to reach you?" },
    { key: "purpose", label: "Are you looking to buy or rent?" },
    { key: "location", label: "Which location/area are you looking at?" },
    { key: "configuration", label: "What configuration are you looking for — 1BHK, 2BHK, 3BHK, or 4BHK?" },
    { key: "budget", label: "What's your budget?" },
    { key: "timeline", label: "When are you planning to move forward?" }
  ],

  // Keep this generic. Client-specific knowledge is loaded securely from the
  // AssistQ dashboard using the clientId, so a client's bot never accidentally
  // answers with ASSISTQ's own pricing or business details.
  faq: `
Q: What are the current prices or offers?
A: I can have the team share the latest pricing and offers with you.

Q: Can I schedule a site visit?
A: Yes. I can collect your details and the team can arrange a suitable time.
`,

  // ---- WEIGHTED LEAD SCORING (out of 100) ----
  // Each field contributes points based on the answer given. Unmatched
  // answers get "default" points for that field. Total score sorts into
  // the bands below (Hot/Warm/Cold), same labels as before, now with a number.
  scoringRules: {
    fields: [
      {
        field: "budget", maxPoints: 25,
        map: {
          "Under ₹50L": 10, "₹50L-1Cr": 18, "₹1Cr-2Cr": 22, "₹2Cr+": 25
        },
        default: 15
      },
      {
        field: "configuration", maxPoints: 25,
        map: {
          "1BHK": 15, "2BHK": 20, "3BHK": 23, "4BHK": 25
        },
        default: 15
      },
      {
        field: "timeline", maxPoints: 20,
        map: {
          "Immediately": 20, "1-3 months": 15, "3-6 months": 10, "Just exploring": 5
        },
        default: 10
      },
      {
        field: "location", maxPoints: 20,
        // No fixed map — location fit is harder to auto-score without a
        // service-area list. Edit "serviceAreas" below to score matches
        // higher; anything else gets the default.
        serviceAreas: ["Navi Mumbai", "Mumbai", "Thane", "Pune"],
        matchPoints: 20,
        default: 12
      },
      {
        field: "purpose", maxPoints: 10,
        map: { "Buying": 10, "Renting": 6 },
        default: 5
      }
    ],
    bands: [
      { min: 80, label: "Hot🔥" },
      { min: 50, label: "Warm🌤️" },
      { min: 0,  label: "Cold❄️" }
    ]
  }
};
// =========================================================

// PER-CLIENT DEPLOYMENT: each client's Apps Script deployment should have
// its own script properties: ASSISTQ_CLIENT_ID, ASSISTQ_BUSINESS_NAME,
// ASSISTQ_CLIENT_EMAIL, ASSISTQ_CLIENT_WHATSAPP, ASSISTQ_SPREADSHEET_ID
// (optional when the script is bound to the client's Sheet),
// ASSISTQ_SHEET_NAME, and ASSISTQ_WEBHOOK_SECRET.
// AssistQ's server also forwards the client values on each request.
// The per-client webhook URL is stored in the AssistQ client record and is
// selected server-side, so one client's webhook can never be used for another.
function normaliseClientId_(id){return String(id||"").toLowerCase().replace(/[^a-z0-9_-]/g,"-").slice(0,60)||"client";}

function prop_(key, fallback){
  const v=PropertiesService.getScriptProperties().getProperty(key);
  return v===null||v===undefined||String(v).trim()==="" ? fallback : String(v).trim();
}

function runtimeConfig_(data){
  data=data||{};
  const clientId=normaliseClientId_(data.clientId);
  const businessName=String(data.businessName||prop_("ASSISTQ_BUSINESS_NAME",CONFIG.businessName)||"").trim();
  const clientEmail=String(data.reportEmail||prop_("ASSISTQ_CLIENT_EMAIL",CONFIG.clientEmail)||"").trim();
  const clientWhatsApp=String(data.clientWhatsApp||prop_("ASSISTQ_CLIENT_WHATSAPP",CONFIG.clientWhatsApp)||"").trim();
  const sheetName=String(prop_("ASSISTQ_SHEET_NAME",CONFIG.sheetName)||"Leads").trim();
  const spreadsheetId=String(prop_("ASSISTQ_SPREADSHEET_ID",data.googleSpreadsheetId||"")||"").trim();
  const secret=String(prop_("ASSISTQ_WEBHOOK_SECRET","")||"").trim();
  return {clientId,businessName,clientEmail,clientWhatsApp,sheetName,spreadsheetId,secret};
}

function assertWebhookSecret_(data){
  const expected=prop_("ASSISTQ_WEBHOOK_SECRET","");
  if(expected && String(data.webhookSecret||"")!==expected) throw new Error("Invalid AssistQ webhook secret for this client.");
}

function spreadsheet_(cfg){
  if(cfg.spreadsheetId) return SpreadsheetApp.openById(cfg.spreadsheetId);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getClientConfig_(data){
  // Client configuration is now supplied by AssistQ's server. This Apps Script
  // must never call back into app.assistq.in, which avoids Google UrlFetch
  // network/redirect issues and removes the old cross-client configuration leak.
  const cfg=runtimeConfig_(data);
  assertWebhookSecret_(data);
  return {clientId:cfg.clientId,active:true,verified:true,businessName:cfg.businessName,clientEmail:cfg.clientEmail,clientWhatsApp:cfg.clientWhatsApp,assistant:data.assistant||null,sheetName:cfg.sheetName,spreadsheetId:cfg.spreadsheetId};
}

function assertClientActive_(data){ return getClientConfig_(data); }

function effectiveConfig_(data){
  const remote=assertClientActive_(data);
  const assistant=remote.assistant||{};
  const questions=(Array.isArray(assistant.questions)&&assistant.questions.length)
    ? assistant.questions.map(function(q){return {key:String(q.key||q.id||"").trim(),label:String(q.label||q.question||q.key||"").trim()};}).filter(function(q){return q.key&&q.label;})
    : CONFIG.questions;
  return {businessName:remote.businessName||CONFIG.businessName,questions:questions,faq:String(assistant.knowledge||CONFIG.faq||""),clientEmail:remote.clientEmail||CONFIG.clientEmail,clientWhatsApp:remote.clientWhatsApp||CONFIG.clientWhatsApp,sheetName:remote.sheetName,spreadsheetId:remote.spreadsheetId};
}

function doPost(e) {
  const timestamp = new Date();
  let data = {};
  try {
    data = JSON.parse(e.postData.contents);
    assertWebhookSecret_(data);

    if (data.action === "chat") {
      const clientCfg = effectiveConfig_(data);
      const result = handleChat(data, clientCfg);
      return jsonOut(result);
    }

    if (data.action === "submit") {
      const clientCfg = assertClientActive_(data);
      const scored = scoreLead(data.fields || {}, data.scoring || null);
      logToSheet(timestamp, data.fields || {}, data.utm || {}, scored, data.clientId || clientCfg.clientId, clientCfg);
      emailClient(data.fields || {}, scored, clientCfg.businessName, clientCfg.clientEmail, clientCfg.clientWhatsApp);
      return jsonOut({ status: "success", clientId: clientCfg.clientId });
    }

    return jsonOut({ status: "error", message: "Unknown action: " + data.action });

  } catch (err) {
    try {
      const ss = spreadsheet_(runtimeConfig_(data));
      let dbg = ss.getSheetByName("Errors");
      if (!dbg) dbg = ss.insertSheet("Errors");
      dbg.appendRow([timestamp, err.toString()]);
      const errorEmail=String(data.reportEmail||prop_("ASSISTQ_ERROR_EMAIL",prop_("ASSISTQ_CLIENT_EMAIL",""))||"").trim();
      if(errorEmail) MailApp.sendEmail(
        errorEmail,
        `⚠️ Bot error — ${data.businessName || prop_("ASSISTQ_BUSINESS_NAME",CONFIG.businessName)}`,
        `An error occurred:\n\n${err.toString()}\n\nSheet: ${ss.getUrl()}\nTime: ${timestamp}`
      );
    } catch (e2) { /* ignore */ }

    return jsonOut({ status: "error", message: err.toString() });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function stripJsonEnvelope_(text) {
  const t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const obj = JSON.parse(t);
    if (obj && typeof obj === "object") return String(obj.reply || obj.message || obj.text || "Got it, thanks!");
  } catch (_) {}
  return t;
}

function parseAssistantJson_(text) {
  const clean = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(clean); } catch (_) {}

  // Recover the first complete JSON object if the model added a short prefix/suffix.
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(clean.slice(start, end + 1)); } catch (_) {}
  }
  throw new Error("Could not parse assistant JSON");
}

function handleChat(data, clientCfg) {
  const knownFields = data.knownFields || {};

  if (!TEST_MODE && data.leadId) trackSession(data.leadId, clientCfg);

  if (TEST_MODE) {
    const nextQ = clientCfg.questions.find(q => !knownFields[q.key]);
    if (nextQ) {
      knownFields[nextQ.key] = "TEST-" + nextQ.key;
      const remaining = clientCfg.questions.find(q => !knownFields[q.key]);
      const reply = remaining
        ? `[TEST MODE] Got it. Next: ${remaining.label}`
        : `[TEST MODE] All fields collected — submitting now.`;
      const complete = clientCfg.questions.every(q => knownFields[q.key]);
      return { reply: reply, fields: knownFields, complete: complete };
    }
    return { reply: "[TEST MODE] Already complete.", fields: knownFields, complete: true };
  }

  const apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return { reply: "Setup needed: add ANTHROPIC_API_KEY in Script Properties.", fields: knownFields, complete: false };
  }

  const questionList = clientCfg.questions
    .map(q => `- ${q.key}: "${q.label}"${knownFields[q.key] ? ` (ALREADY ANSWERED: "${knownFields[q.key]}" — do not ask again)` : ""}`)
    .join("\n");

  const systemPrompt = `You are a friendly assistant chatting with a prospective customer on behalf of ${clientCfg.businessName}.

Ask the following questions ONE AT A TIME, naturally, skipping any already answered:
${questionList}

If the prospect asks something else, answer using this info, then continue with the next unanswered question:
${clientCfg.faq}

If you don't know something, say the team will follow up on that point — never invent an answer.

Respond with ONLY valid JSON, no other text before or after it, in exactly this shape — this is critical, never write a plain sentence outside the JSON:
{"reply": "your message", "fields": {"key": "value", ...only fields learned/confirmed this turn...}}

Example of a correct response:
{"reply": "Great, thanks! What's the best phone number to reach you?", "fields": {"name": "Anushka"}}`;

  const model = PropertiesService.getScriptProperties().getProperty("ASSISTQ_CLAUDE_MODEL") || "claude-sonnet-5";
  const payload = {
    model: model,
    max_tokens: 1600,
    thinking: { type: "disabled" },
    system: systemPrompt,
    messages: data.messages
  };

  const response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post",
    contentType: "application/json",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const raw = response.getContentText();
  let result;
  try {
    result = JSON.parse(raw);
  } catch (parseError) {
    return { reply: "The AI service returned an unexpected response. Please try again.", fields: knownFields, complete: false };
  }

  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || result.error) {
    const message = result && result.error && result.error.message ? result.error.message : "HTTP " + response.getResponseCode();
    return { reply: "AI service error: " + message, fields: knownFields, complete: false };
  }

  let parsed;
  let extractionFailed = false;
  try {
    const textBlock = (result.content || []).find(b => b.type === "text");
    if (!textBlock) throw new Error("No text block in response");
    parsed = parseAssistantJson_(textBlock.text);
    if (!parsed || typeof parsed !== "object") throw new Error("Assistant JSON was not an object");
  } catch (e) {
    extractionFailed = true;
    const textBlock = (result.content || []).find(b => b.type === "text");
    const fallbackText = textBlock ? stripJsonEnvelope_(textBlock.text) : "Got it, thanks!";
    parsed = { reply: fallbackText, fields: {} };
  }

  // Some Claude responses may wrap the structured payload one level deeper
  // (for example { reply: "...", json: { reply: "...", fields: {...} } }).
  // Normalise that shape here so the widget NEVER displays the raw JSON
  // envelope to the visitor.
  if (parsed && parsed.json && typeof parsed.json === "object") {
    parsed = Object.assign({}, parsed.json, parsed);
    if (parsed.json && typeof parsed.json === "object") {
      parsed.fields = parsed.json.fields || parsed.fields || {};
      parsed.reply = parsed.json.reply || parsed.reply;
    }
    delete parsed.json;
  }
  if (parsed && typeof parsed.reply === "object") {
    const nested = parsed.reply;
    parsed.reply = nested.reply || nested.message || nested.text || JSON.stringify(nested);
    if (nested.fields && typeof nested.fields === "object") {
      parsed.fields = Object.assign({}, parsed.fields || {}, nested.fields);
    }
  }
  if (typeof parsed.reply !== "string") parsed.reply = String(parsed.reply || "Got it, thanks!");

  // Trust the AI's own structured field extraction — that's exactly what
  // the JSON contract above asks it to produce, and it understands the
  // full conversation (so "hey", small talk, or a question asked mid-flow
  // never gets misfiled as the answer to whichever field happens to be
  // next). Only fall back to the old crude "assign the last message to
  // whatever's still pending" guess when the model's JSON genuinely failed
  // to parse — never just because a field happens to still be empty,
  // otherwise the same misfiling bug creeps back in.
  const mergedFields = Object.assign({}, knownFields, parsed.fields || {});

  if (extractionFailed) {
    const pendingQ = clientCfg.questions.find(q => !mergedFields[q.key]);
    const lastUserMsg = [...data.messages].reverse().find(m => m.role === "user");
    const looksLikeQuestion = lastUserMsg && isLikelyQuestion(lastUserMsg.content);
    if (pendingQ && lastUserMsg && !looksLikeQuestion) {
      mergedFields[pendingQ.key] = lastUserMsg.content;
    }
  }

  const complete = clientCfg.questions.every(q => mergedFields[q.key]);

  return { reply: parsed.reply, fields: mergedFields, complete: complete };
}

function toLabel(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function isLikelyQuestion(text) {
  const t = text.trim();
  if (t.endsWith("?")) return true;
  return /^(what|how|when|where|why|who|which|can|could|do|does|did|is|are|will|would|should|may)\b/i.test(t);
}

/**
 * Logs each unique conversation once (by leadId), so the weekly report can
 * show real "conversations started" numbers, not just completed leads.
 */
function trackSession(leadId, passedCfg) {
  const ss = spreadsheet_(passedCfg || runtimeConfig_({clientId:leadId}));
  let sheet = ss.getSheetByName("Sessions");
  if (!sheet) {
    sheet = ss.insertSheet("Sessions");
    sheet.appendRow(["Lead ID", "First Seen"]);
  }
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
    if (ids.includes(leadId)) return; // already tracked
  }
  sheet.appendRow([leadId, new Date()]);
}

/**
 * Weighted numeric scoring, e.g. Budget 22/25 + Requirement 23/25 +
 * Timeline 20/20 + Location 17/20 + Intent 8/10 = 90/100.
 * Returns { score, band } — band is Hot/Warm/Cold based on CONFIG.scoringRules.bands.
 */
function scoreLead(fields, customRules) {
  const rules = customRules && Array.isArray(customRules.fields) ? customRules : CONFIG.scoringRules;
  if (!rules) return { score: null, band: "" };

  let total = 0;
  rules.fields.forEach(f => {
    const value = fields[f.field];

    if (f.serviceAreas) {
      // Location-style field: score higher if it matches a known service area
      const matched = value && f.serviceAreas.some(a => value.toLowerCase().includes(a.toLowerCase()));
      total += matched ? f.matchPoints : f.default;
      return;
    }

    if (value && f.map[value] !== undefined) {
      total += f.map[value];
    } else {
      total += f.default;
    }
  });

  total = Math.min(total, 100);

  const band = (rules.bands.find(b => total >= b.min) || { label: "" }).label;

  return { score: total, band: band };
}

function logToSheet(timestamp, data, utm, scored, clientId, passedCfg) {
  const cfg = passedCfg || runtimeConfig_({clientId});
  const ss = spreadsheet_(cfg);
  let sheet = ss.getSheetByName(cfg.sheetName);
  const fieldKeys = Object.keys(data);
  const utmCols = ["UTM Source", "UTM Medium", "UTM Campaign"];
  const fixedCols = ["Timestamp", "Client ID", "Score", "Band", ...utmCols];

  if (!sheet || sheet.getLastColumn() === 0) {
    if (!sheet) sheet = ss.insertSheet(cfg.sheetName);
    sheet.appendRow([...fixedCols, ...fieldKeys.map(toLabel)]);
  } else {
    const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    fieldKeys.forEach(key => {
      if (!existingHeaders.includes(toLabel(key))) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(toLabel(key));
      }
    });
    fixedCols.forEach(col => {
      if (!existingHeaders.includes(col)) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(col);
      }
    });
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => {
    if (h === "Timestamp") return timestamp;
    if (h === "Client ID") return clientId || "";
    if (h === "Score") return scored.score != null ? scored.score : "";
    if (h === "Band") return scored.band || "";
    if (h === "UTM Source") return utm.source || "";
    if (h === "UTM Medium") return utm.medium || "";
    if (h === "UTM Campaign") return utm.campaign || "";
    const key = Object.keys(data).find(k => toLabel(k) === h);
    return key ? data[key] : "";
  });
  sheet.appendRow(row);
}

function emailClient(data, scored, businessName, clientEmail, clientWhatsApp) {
  const nameField = data.name || Object.values(data)[0] || "New lead";
  const bandEmoji = scored.band === "Hot" ? " 🔥" : scored.band === "Warm" ? " 🌤️" : scored.band === "Cold" ? " ❄️" : "";
  const subject = `New Lead for ${businessName}: ${nameField} — ${scored.score}/100${bandEmoji} ${scored.band}`;

  const lines = Object.entries(data)
    .map(([key, value]) => `${toLabel(key)}: ${value}`)
    .join("\n");

  const waLink = `https://wa.me/${clientWhatsApp || CONFIG.clientWhatsApp}?text=${encodeURIComponent(
    `New lead from your bot:\n${lines}`
  )}`;

  const body = `You've got a new lead from your AssistQ chatbot.

Lead Score: ${scored.score}/100 (${scored.band})
${lines}

Tap to notify yourself on WhatsApp: ${waLink}`;

  MailApp.sendEmail(clientEmail, subject, body);
}

/**
 * ---- WEEKLY FUNNEL REPORT ----
 * ONE-TIME SETUP: run createWeeklyTrigger() once from the function
 * dropdown in the Apps Script editor. After that it runs every Sunday.
 *
 * Shows, per traffic source: Leads (total) → Qualified (score 50+) → Hot (80+)
 */
function createWeeklyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'sendWeeklyReport') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('sendWeeklyReport')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(20)
    .create();
}

function sendWeeklyReport() {
  const cfg=runtimeConfig_({clientId:prop_("ASSISTQ_CLIENT_ID","client")});
  const ss = spreadsheet_(cfg);
  const sheet = ss.getSheetByName(cfg.sheetName);
  if (!sheet || sheet.getLastRow() < 2) return;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  const tsCol = headers.indexOf("Timestamp");
  const scoreCol = headers.indexOf("Score");
  const sourceCol = headers.indexOf("UTM Source");

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const weekRows = rows.filter(r => r[tsCol] && new Date(r[tsCol]) >= oneWeekAgo);

  // Conversations started this week, from the Sessions tracker
  const sessionsSheet = ss.getSheetByName("Sessions");
  let conversationsCount = 0;
  if (sessionsSheet && sessionsSheet.getLastRow() > 1) {
    const sessionRows = sessionsSheet.getRange(2, 1, sessionsSheet.getLastRow() - 1, 2).getValues();
    conversationsCount = sessionRows.filter(r => r[1] && new Date(r[1]) >= oneWeekAgo).length;
  }

  const totalLeads = weekRows.length;
  const totalQualified = weekRows.filter(r => (Number(r[scoreCol]) || 0) >= 50).length;
  const totalHot = weekRows.filter(r => (Number(r[scoreCol]) || 0) >= 80).length;

  // Per-source breakdown
  const bySource = {};
  weekRows.forEach(r => {
    const src = r[sourceCol] || "Direct/Unknown";
    const score = Number(r[scoreCol]) || 0;
    if (!bySource[src]) bySource[src] = { leads: 0, qualified: 0, hot: 0 };
    bySource[src].leads++;
    if (score >= 50) bySource[src].qualified++;
    if (score >= 80) bySource[src].hot++;
  });

  // Top source = highest lead volume this week
  let topSource = null;
  Object.entries(bySource).forEach(([src, s]) => {
    if (!topSource || s.leads > bySource[topSource].leads) topSource = src;
  });
  const topSourceRate = topSource ? Math.round((bySource[topSource].qualified / bySource[topSource].leads) * 100) : 0;

  const tableRows = Object.entries(bySource)
    .map(([src, s]) => `  ${src.padEnd(20)} Leads: ${s.leads}   Qualified: ${s.qualified}   Hot: ${s.hot}`)
    .join("\n");

  const insight = generateWeeklyInsight(bySource, totalLeads, totalQualified, totalHot);

  const body = `📊 ${cfg.businessName} Weekly Lead Intelligence

PERFORMANCE
${conversationsCount} conversations started
${totalLeads} leads captured
${totalQualified} qualified
${totalHot} HOT leads

TOP SOURCE
🥇 ${topSource || "N/A"} — ${topSourceRate}% qualification rate

BY SOURCE (Leads → Qualified → Hot)
${tableRows || "  (none)"}

${insight ? `AI INSIGHT\n${insight}\n` : ""}
Full details in your Sheet: ${ss.getUrl()}`;

  MailApp.sendEmail(cfg.clientEmail, `📊 Weekly Lead Intelligence — ${cfg.businessName}`, body);
}

/**
 * One short AI call per week (pennies) that turns the raw numbers into a
 * plain-English insight + recommendation, the way a real analyst would.
 * If it fails for any reason, the report still sends without this section.
 */
function generateWeeklyInsight(bySource, totalLeads, totalQualified, totalHot) {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
    if (!apiKey) return "";

    const sourceSummary = Object.entries(bySource)
      .map(([src, s]) => `${src}: ${s.leads} leads, ${s.qualified} qualified, ${s.hot} hot`)
      .join("; ");

    const prompt = `You are a marketing analyst. Given this week's lead data, write exactly two short lines:
Line 1: one sentence of genuine insight comparing sources (not just restating numbers).
Line 2: one specific, actionable recommendation.
No preamble, no headers, just the two lines.

Data: ${sourceSummary}. Totals: ${totalLeads} leads, ${totalQualified} qualified, ${totalHot} hot.`;

    const response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
      method: "post",
      contentType: "application/json",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      payload: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }]
      }),
      muteHttpExceptions: true
    });

    const result = JSON.parse(response.getContentText());
    const textBlock = result.content && result.content.find(b => b.type === "text");
    return textBlock ? textBlock.text.trim() : "";
  } catch (e) {
    return "";
  }
}
