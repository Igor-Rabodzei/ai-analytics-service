// File processing tool for high-performance data extraction
import { z } from "zod";
import { spawn } from "child_process";
import { createHash } from "crypto";

const fileProcessorParameters = z.object({
  operation: z.enum(["extract_metric", "extract_multiple_metrics"]),
  file_content: z.string(), // Content of the file to process
  metric_name: z.string().optional(), // Single metric name
  metrics: z.array(z.string()).optional(), // Multiple metric names
  date_from: z.string().optional(), // Date filter start (YYYY-MM-DD)
  date_to: z.string().optional(), // Date filter end (YYYY-MM-DD)
}).strip();

type FileProcessorResult = {
  values?: number[];
  metric?: string;
  column_used?: string;
  total_rows?: number;
  valid_values?: number;
  date_range?: {
    from?: string;
    to?: string;
  };
  sample_data?: Record<string, unknown>[];
  results?: Record<string, unknown>;
  available_columns?: string[];
  error?: string;
};

// Simple in-memory cache for file processing results
const fileProcessingCache = new Map<string, { result: FileProcessorResult; timestamp: number }>();
const FILE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function generateFileCacheKey(data: z.infer<typeof fileProcessorParameters>): string {
  return createHash('md5').update(JSON.stringify(data)).digest('hex');
}

function getCachedFileResult(key: string): FileProcessorResult | null {
  const cached = fileProcessingCache.get(key);
  if (cached && Date.now() - cached.timestamp < FILE_CACHE_TTL) {
    return cached.result;
  }
  fileProcessingCache.delete(key);
  return null;
}

function setCachedFileResult(key: string, result: FileProcessorResult): void {
  fileProcessingCache.set(key, { result, timestamp: Date.now() });
  
  // Clean up old entries periodically
  if (fileProcessingCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of fileProcessingCache.entries()) {
      if (now - v.timestamp > FILE_CACHE_TTL) {
        fileProcessingCache.delete(k);
      }
    }
  }
}

// Python file processing service
async function callPythonFileProcessor(data: z.infer<typeof fileProcessorParameters>): Promise<FileProcessorResult> {
  return new Promise((resolve, reject) => {
    const python = spawn('python', ['file_processor.py'], {
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
        reject(new Error(`Python file processor exited with code ${code}: ${error}`));
        return;
      }
      
      try {
        const parsed = JSON.parse(result);
        resolve(parsed);
      } catch {
        reject(new Error(`Failed to parse Python file processor output: ${result}`));
      }
    });

    python.stdin.write(JSON.stringify(data));
    python.stdin.end();
  });
}

export const fileProcessorTool = {
  parameters: fileProcessorParameters,
  description: "High-performance file processing for extracting metric values from large CSV/Excel files. Use this for fast data extraction from files found by file_search.",
  
  execute: async (args: z.infer<typeof fileProcessorParameters>): Promise<FileProcessorResult> => {
    const p = fileProcessorParameters.parse(args);
    
    // Log the file processing request
    console.log('📁 File processor called with:', {
      operation: p.operation,
      metric_name: p.metric_name,
      metrics_count: p.metrics?.length || 0,
      file_size: p.file_content.length,
      date_from: p.date_from,
      date_to: p.date_to,
      file_content_preview: p.file_content.substring(0, 100) + '...'
    });

    // Check cache first
    const cacheKey = generateFileCacheKey(p);
    const cachedResult = getCachedFileResult(cacheKey);
    if (cachedResult) {
      console.log('📦 Using cached file processing result');
      return { ...cachedResult, cached: true } as FileProcessorResult & { cached: boolean };
    }

    try {
      console.log('🐍 Using Python for file processing');
      const result = await callPythonFileProcessor(p);
      console.log('🐍 Python file processing result:', {
        values_count: result.values?.length || 0,
        total_rows: result.total_rows,
        valid_values: result.valid_values,
        error: result.error
      });
      
      setCachedFileResult(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Python file processing failed:', error);
      return {
        error: `File processing failed: ${error instanceof Error ? error.message : String(error)}`,
        values: [],
        total_rows: 0,
        valid_values: 0
      };
    }
  },
} as const;
