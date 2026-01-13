// File reader tool for reading file content from file names
import { z } from "zod";
import { spawn } from "child_process";
import { createHash } from "crypto";

const fileReaderParameters = z.object({
  file_name: z.string(), // Name of the file to read
  file_id: z.string().optional(), // Optional file ID from file_search
}).strip();

type FileReaderResult = {
  file_content?: string;
  file_name?: string;
  file_size?: number;
  error?: string;
};

// Simple in-memory cache for file content
const fileContentCache = new Map<string, { result: FileReaderResult; timestamp: number }>();
const FILE_CONTENT_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function generateFileContentCacheKey(data: z.infer<typeof fileReaderParameters>): string {
  return createHash('md5').update(JSON.stringify(data)).digest('hex');
}

function getCachedFileContent(key: string): FileReaderResult | null {
  const cached = fileContentCache.get(key);
  if (cached && Date.now() - cached.timestamp < FILE_CONTENT_CACHE_TTL) {
    return cached.result;
  }
  fileContentCache.delete(key);
  return null;
}

function setCachedFileContent(key: string, result: FileReaderResult): void {
  fileContentCache.set(key, { result, timestamp: Date.now() });
  
  // Clean up old entries periodically
  if (fileContentCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of fileContentCache.entries()) {
      if (now - v.timestamp > FILE_CONTENT_CACHE_TTL) {
        fileContentCache.delete(k);
      }
    }
  }
}

// Python file reader service
async function callPythonFileReader(data: z.infer<typeof fileReaderParameters>): Promise<FileReaderResult> {
  return new Promise((resolve, reject) => {
    const python = spawn('python', ['file_reader.py'], {
      cwd: process.cwd(),
      env: { ...process.env, PATH: `${process.cwd()}/venv/bin:${process.env.PATH}` }
    });
    
    let result = '';
    let error = '';

    python.stdout.on('data', (data) => {
      result += data.toString();
    });

    python.stderr.on('data', (data) => {
      error += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python file reader exited with code ${code}: ${error}`));
        return;
      }
      
      try {
        const parsed = JSON.parse(result);
        resolve(parsed);
      } catch {
        reject(new Error(`Failed to parse Python file reader output: ${result}`));
      }
    });

    python.stdin.write(JSON.stringify(data));
    python.stdin.end();
  });
}

export const fileReaderTool = {
  parameters: fileReaderParameters,
  description: "Read file content from file names returned by file_search. Use this to get the actual file content before processing with file_processor.",
  
  execute: async (args: z.infer<typeof fileReaderParameters>): Promise<FileReaderResult> => {
    const p = fileReaderParameters.parse(args);
    
    // Log the file reading request
    console.log('📖 File reader called with:', {
      file_name: p.file_name,
      file_id: p.file_id
    });

    // Check cache first
    const cacheKey = generateFileContentCacheKey(p);
    const cachedResult = getCachedFileContent(cacheKey);
    if (cachedResult) {
      console.log('📦 Using cached file content');
      return { ...cachedResult, cached: true } as FileReaderResult & { cached: boolean };
    }

    try {
      console.log('🐍 Using Python for file reading');
      const result = await callPythonFileReader(p);
      console.log('🐍 Python file reading result:', {
        file_name: result.file_name,
        file_size: result.file_size,
        has_content: !!result.file_content,
        error: result.error
      });
      
      setCachedFileContent(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Python file reading failed:', error);
      return {
        error: `File reading failed: ${error instanceof Error ? error.message : String(error)}`,
        file_name: p.file_name
      };
    }
  },
} as const;
