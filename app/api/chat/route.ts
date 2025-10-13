import { openai } from "@ai-sdk/openai";
import { streamText, UIMessage, convertToModelMessages } from "ai";
import { prompt } from "./prompt";

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
    
  const result = streamText({
    model: openai("gpt-4o-mini"),
    messages: convertToModelMessages(messages),
    system: prompt,
    tools: {
      file_search: openai.tools.fileSearch({
        vectorStoreIds: [process.env.OPENAI_VECTOR_STORE_ID!],
      }),
    },
    toolChoice: { type: "tool", toolName: "file_search" },
  });

  return result.toUIMessageStreamResponse();
}
