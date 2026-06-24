// /api/chat.js
//
// Secure server-side proxy for the Crave Productions "Live AI Support" chat
// widget. This file runs ONLY on Vercel's servers — it is never sent to the
// browser, so this is the one safe place to use a real OpenRouter API key.
//
// ─────────────────────────────────────────────────────────────────────────
// REQUIRED ONE-TIME SETUP (do this in the Vercel dashboard, not in code):
//   1. Open your Vercel Project → Settings → Environment Variables.
//   2. Add:  Name = OPENROUTER_API_KEY   Value = <your real OpenRouter key>
//   3. Redeploy the project.
//
// Never paste the real key into this file, into chat, into a commit, or into
// any other place that isn't a private environment-variable store. If a key
// has ever been shared outside of that, treat it as compromised and generate
// a new one at https://openrouter.ai/keys immediately.
// ─────────────────────────────────────────────────────────────────────────

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// You can swap this for any chat model id supported by OpenRouter.
const MODEL = "openai/gpt-4o-mini";

function buildSystemPrompt(context, assistantName) {
  const name = assistantName || "Crave Assistant";
  return [
    `You are "${name}", the official live customer-support assistant embedded on the Crave Productions Pvt Ltd bakery website (Katugastota, Sri Lanka).`,
    "SCOPE — you may ONLY discuss topics related to Crave Productions: the bakery's products/menu/prices, categories, stock status, custom cake orders, delivery, opening hours, contact details, bank/payment details, FAQs, how to order via WhatsApp, and general friendly small talk about the bakery.",
    "If the customer asks about anything unrelated to Crave Productions (general knowledge, other companies, coding, news, unrelated personal advice, etc.), politely decline in one short sentence and steer the conversation back to how you can help with Crave Productions, in the same language they used.",
    "IDENTITY — if asked who built/made/created you or this chat system, answer only: \"Crave Productions Pvt Ltd\" built this. Never mention OpenRouter, OpenAI, Anthropic, Claude, GPT, or any AI provider or model name, under any circumstance.",
    "LANGUAGE — always reply in the same language the customer used (Sinhala or English, or a natural mix of both — \"Singlish\" — if that's what they used). Keep tone warm, friendly, professional, and fast — short, clear paragraphs, no walls of text.",
    "ACCURACY — use ONLY the BUSINESS_CONTEXT JSON below as your source of truth for products, prices, stock, contact info, and bank details. If something isn't in BUSINESS_CONTEXT, say you're not fully sure and suggest contacting the bakery directly via WhatsApp or phone rather than guessing.",
    "Keep replies concise (usually 1-4 sentences) unless the customer asks for a detailed list (e.g. full menu), in which case a short bulleted list is fine.",
    "BUSINESS_CONTEXT:",
    JSON.stringify(context || {})
  ].join("\n\n");
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("[api/chat] Missing OPENROUTER_API_KEY environment variable.");
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: "Server is not configured yet (missing OPENROUTER_API_KEY)." }));
  }

  let body = req.body;
  if (!body) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "Empty request body" }));
  }
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Invalid JSON body" }));
    }
  }

  const { message, history, context, assistantName } = body;

  if (!message || typeof message !== "string" || !message.trim()) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "Missing 'message' field" }));
  }

  const safeHistory = Array.isArray(history) ? history.slice(-10) : [];

  const messages = [
    { role: "system", content: buildSystemPrompt(context, assistantName) },
    ...safeHistory
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map(m => ({ role: m.role, content: m.content.slice(0, 2000) })),
    { role: "user", content: message.slice(0, 2000) }
  ];

  try {
    const upstream = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
        // Optional but recommended by OpenRouter for attribution/rate-limit context:
        "HTTP-Referer": "https://crave-production-cake-store-v10.vercel.app/",
        "X-Title": "Crave Productions Live Support"
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.6,
        max_tokens: 500
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      console.error("[api/chat] OpenRouter error:", upstream.status, errText);
      res.statusCode = 502;
      return res.end(JSON.stringify({ error: "Upstream AI provider error" }));
    }

    const data = await upstream.json();
    const reply = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
      ? data.choices[0].message.content.trim()
      : "සමාවෙන්න, මට දැන් උත්තර දෙන්න බැරිවුණා. කරුණාකර WhatsApp එකෙන් අපිට කතා කරන්න.";

    res.statusCode = 200;
    return res.end(JSON.stringify({ reply }));
  } catch (err) {
    console.error("[api/chat] Unexpected error:", err);
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: "Unexpected server error" }));
  }
};
