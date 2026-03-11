import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // service key — never exposed to browser
);

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { systemPrompt, userMessage, maxTokens = 1000 } = req.body;

    // 1. Verify Supabase JWT from Authorization header
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: "Invalid session" });

    // 2. Check usage record
    let { data: usage, error: usageError } = await supabase
      .from("usage")
      .select("*")
      .eq("user_id", user.id)
      .single();

    // Create usage record if first time
    if (usageError && usageError.code === "PGRST116") {
      const { data: newUsage } = await supabase
        .from("usage")
        .insert({ user_id: user.id, generations: 0, is_subscribed: false })
        .select()
        .single();
      usage = newUsage;
    }

    // 3. Enforce paywall — 1 free generation, then subscription required
    if (!usage.is_subscribed && usage.generations >= 1) {
      return res.status(402).json({
        error: "free_limit_reached",
        message: "You've used your free generation. Subscribe to continue."
      });
    }

    // 4. Call Anthropic
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }]
    });

    const text = response.content.map(b => b.text || "").join("\n");

    // 5. Increment usage counter
    await supabase
      .from("usage")
      .update({ generations: (usage.generations || 0) + 1 })
      .eq("user_id", user.id);

    return res.status(200).json({ text });

  } catch (err) {
    console.error("generate error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
