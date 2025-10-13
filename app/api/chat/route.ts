import { openai } from "@ai-sdk/openai";
import { streamText, UIMessage, convertToModelMessages } from "ai";
import { prompt } from "./prompt";
import { calcTool } from "./alc";

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
    
  const result = streamText({
    model: openai("gpt-4.1"),
    messages: convertToModelMessages(messages),
    system: prompt,
    temperature: 0,
    tools: {
      file_search: openai.tools.fileSearch({
        vectorStoreIds: [process.env.OPENAI_VECTOR_STORE_ID!],
      }),
      calc: {
        description: "Deterministic finance math. Sums, deltas, ROMI, FX normalization.",
        inputSchema: calcTool.parameters,
        execute: calcTool.execute,
      },
    }
  });

  return result.toUIMessageStreamResponse();
}