import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

    // Check usage
    const { data: usage } = await supabase
      .from("usage")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!usage) return res.status(404).json({ error: "Usage record not found" });
    if (!usage.is_subscribed && usage.generations >= 1) {
      return res.status(402).json({ error: "Free limit reached. Please subscribe to continue." });
    }

    const body = req.body || {};

    // Support OLD app format: { systemPrompt, userMessage, maxTokens }
    // AND new format: { briefInput, projectName }
    let systemPrompt, userMessage, maxTokens, projectName, briefInput;

    if (body.systemPrompt && body.userMessage) {
      // OLD FORMAT — used by the existing app
      systemPrompt = body.systemPrompt;
      userMessage = body.userMessage;
      maxTokens = body.maxTokens || 2000;
      projectName = null;
      briefInput = { prompt: body.userMessage.slice(0, 500) };
    } else {
      // NEW FORMAT
      briefInput = body.briefInput || {};
      projectName = body.projectName || null;

      const briefText = typeof briefInput === "string"
        ? briefInput
        : Object.entries(briefInput)
            .filter(([_, v]) => v)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n");

      if (!briefText.trim()) {
        return res.status(400).json({ error: "Brief input required" });
      }

      systemPrompt = `You are an AI Creative Director with the combined creative DNA of W+K, 72andSunny, Edelman, GS&P, BBH, and Droga5. Generate bold, distinctive campaign concepts.`;
      userMessage = `Here is the brief:\n\n${briefText}\n\nGenerate 3 campaign concepts.`;
      maxTokens = 2000;
    }

    // Call Claude
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: maxTokens || 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const output = message.content[0].text;

    // Save to history (non-blocking)
    try {
      await supabase.from("generations").insert({
        user_id: user.id,
        project_name: projectName || null,
        brief_input: briefInput,
        output: output,
        is_favorited: false,
      });
    } catch (saveErr) {
      console.error("History save error (non-fatal):", saveErr);
    }

    // Update usage count
    await supabase
      .from("usage")
      .update({ generations: (usage.generations || 0) + 1 })
      .eq("user_id", user.id);

    return res.status(200).json({ output });

  } catch (error) {
    console.error("Generate error:", error);
    return res.status(500).json({ error: error.message });
  }
}
