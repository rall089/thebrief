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
      return res.status(403).json({ error: "Free limit reached. Please subscribe to continue." });
    }

    const body = req.body || {};
    const briefInput = body.briefInput || body.brief_input || body.brief || null;
    const projectName = body.projectName || body.project_name || "";

    // Build brief text from whatever we received
    let briefText = "";
    if (!briefInput) {
      // Try treating the whole body as the brief fields
      const fields = ["brand","problem","audience","message","rtb","tone"];
      const fromBody = fields.filter(f => body[f]).map(f => `${f}: ${body[f]}`).join("\n");
      if (fromBody) {
        briefText = fromBody;
      } else {
        return res.status(400).json({ error: "Brief input required" });
      }
    } else if (typeof briefInput === "string") {
      briefText = briefInput;
    } else {
      briefText = Object.entries(briefInput)
        .filter(([_, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
    }

    if (!briefText.trim()) return res.status(400).json({ error: "Brief input required" });

    const systemPrompt = `You are an AI Creative Director with the combined creative DNA of the world's greatest advertising agencies — W+K, 72andSunny, Edelman, GS&P, BBH, and Droga5.

Your job is to take a creative brief and generate bold, distinctive campaign concepts that could win at Cannes.

For each concept, provide:
- A short, punchy campaign name (3-5 words max)
- A one-line campaign idea (the territory)
- A compelling insight that drives the idea
- 3 execution ideas across different channels
- A potential tagline

Generate 3 distinct campaign concepts. Make them genuinely different from each other — different territories, different emotional registers, different strategic angles. No safe, predictable ideas.

Format your response clearly with each concept separated and labeled.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: `Here is the brief:\n\n${briefText}\n\nGenerate 3 campaign concepts.` }],
    });

    const output = message.content[0].text;

    // Save generation to database (private to this user)
    const { data: generation, error: saveError } = await supabase
      .from("generations")
      .insert({
        user_id: user.id,
        project_name: projectName || null,
        brief_input: briefInput ? (typeof briefInput === "string" ? { raw: briefInput } : briefInput) : { raw: briefText },
        output: output,
        is_favorited: false,
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving generation:", saveError);
      // Don't fail the request — still return the output
    }

    // Update usage count
    await supabase
      .from("usage")
      .update({ generations: (usage.generations || 0) + 1 })
      .eq("user_id", user.id);

    return res.status(200).json({
      output,
      generationId: generation?.id || null,
    });

  } catch (error) {
    console.error("Generate error:", error);
    return res.status(500).json({ error: error.message });
  }
}
