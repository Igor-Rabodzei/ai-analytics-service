// tools/calc.ts
import { z } from "zod";
import { spawn } from "child_process";
import { createHash } from "crypto";

const calcParameters = z.object({
  op: z.enum(["sum", "avg", "romi", "deltaPct", "aggregateRevenue", "batchAggregateRevenue", "sumMetric"]),
  numbers: z.array(z.number()).optional(), // для sum/avg
  num: z.number().optional(),              // поточне значення
  den: z.number().optional(),              // базове (для ROMI = num/den)
  old: z.number().optional(),              // для deltaPct
  fxRows: z.array(z.object({               // для aggregateRevenue
    amount: z.number(),                    // сума у локальній валюті або USD
    currency: z.string().default("USD"),
    fxToUSD: z.number().default(1),        // множник до USD (якщо currency != USD)
    kind: z.enum(["payment","refund","chargeback"]).default("payment"),
  })).optional(),
  batchSize: z.number().default(1000),    // розмір батчу для обробки
  // Нові параметри для sumMetric
  metric: z.string().optional(),           // назва метрики (наприклад, "gross_profit_12_fx")
  from: z.string().optional(),             // дата початку (YYYY-MM-DD)
  to: z.string().optional(),               // дата кінця (YYYY-MM-DD)
  values: z.array(z.number()).optional(),  // значення метрики для сумування
}).strip();

// Simple in-memory cache for calculation results
type CalcResult = {
  result: number | null;
  breakdown?: {
    payments: number;
    refunds: number;
    chargebacks: number;
  };
  processedBatches?: number;
  cached?: boolean;
  note?: string;
};

const calculationCache = new Map<string, { result: CalcResult; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function generateCacheKey(data: z.infer<typeof calcParameters>): string {
  return createHash('md5').update(JSON.stringify(data)).digest('hex');
}

function getCachedResult(key: string): CalcResult | null {
  const cached = calculationCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }
  calculationCache.delete(key);
  return null;
}

function setCachedResult(key: string, result: CalcResult): void {
  calculationCache.set(key, { result, timestamp: Date.now() });
  
  // Clean up old entries periodically
  if (calculationCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of calculationCache.entries()) {
      if (now - v.timestamp > CACHE_TTL) {
        calculationCache.delete(k);
      }
    }
  }
}

// Python calculation service for heavy computations
async function callPythonCalc(data: z.infer<typeof calcParameters>): Promise<CalcResult> {
  return new Promise((resolve, reject) => {
    const python = spawn('python', ['python_calc.py'], {
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
        reject(new Error(`Python process exited with code ${code}: ${error}`));
        return;
      }
      
      try {
        const parsed = JSON.parse(result);
        resolve(parsed);
      } catch {
        reject(new Error(`Failed to parse Python output: ${result}`));
      }
    });

    python.stdin.write(JSON.stringify(data));
    python.stdin.end();
  });
}

// Determine if we should use Python for better performance
function shouldUsePython(op: string, data: z.infer<typeof calcParameters>): boolean {
  // Use Python for aggregateRevenue with large datasets (>1000 rows)
  if (op === 'aggregateRevenue' && data.fxRows && data.fxRows.length > 1000) {
    return true;
  }
  
  // Use Python for sum/avg with large arrays (>10000 numbers)
  if ((op === 'sum' || op === 'avg') && data.numbers && data.numbers.length > 10000) {
    return true;
  }
  
  return false;
}

export const calcTool = {
  parameters: calcParameters,
  // головне — вся математика тут, не в LLM
  execute: async (args: z.infer<typeof calcParameters>): Promise<CalcResult> => {
    const p = calcParameters.parse(args);
    
    // Log the calculation request
    console.log('🔢 Calc tool called with:', {
      op: p.op,
      hasNumbers: p.numbers?.length || 0,
      hasFxRows: p.fxRows?.length || 0,
      hasValues: p.values?.length || 0,
      metric: p.metric,
      from: p.from,
      to: p.to
    });

    // Check cache first
    const cacheKey = generateCacheKey(p);
    const cachedResult = getCachedResult(cacheKey);
    if (cachedResult) {
      console.log('📦 Using cached result:', cachedResult);
      return { ...cachedResult, cached: true };
    }

    // Check if we should use Python for better performance
    if (shouldUsePython(p.op, p)) {
      try {
        console.log('🐍 Using Python for calculation');
        const result = await callPythonCalc(p);
        console.log('🐍 Python result:', result);
        setCachedResult(cacheKey, result);
        return result;
      } catch (error) {
        console.warn('Python calculation failed, falling back to TypeScript:', error);
        // Fall through to TypeScript implementation
      }
    }


    switch (p.op) {
      case "sum": {
        // Optimized: avoid creating Decimal objects in reduce
        const numbers = p.numbers ?? [];
        if (numbers.length === 0) return { result: 0 };
        
        let sum = 0;
        for (let i = 0; i < numbers.length; i++) {
          sum += numbers[i];
        }
        const result = { result: sum };
        console.log('🔢 TypeScript sum result:', result);
        setCachedResult(cacheKey, result);
        return result;
      }

      case "avg": {
        const arr = p.numbers ?? [];
        if (!arr.length) return { result: 0 };
        
        // Optimized: use native number arithmetic for better performance
        let sum = 0;
        for (let i = 0; i < arr.length; i++) {
          sum += arr[i];
        }
        const result = { result: sum / arr.length };
        setCachedResult(cacheKey, result);
        return result;
      }

      case "romi": {
        // ROMI = revenue / cost
        const num = p.num ?? 0;
        const den = p.den ?? 0;
        if (den === 0) return { result: null };
        
        const romi = num / den;
        const result = { result: Number(romi.toFixed(12)) };
        setCachedResult(cacheKey, result);
        return result;
      }

      case "deltaPct": {
        const old = p.old ?? 0;
        const num = p.num ?? 0;
        if (old === 0) {
          return { result: null, note: "old == 0 → % зміна не визначена, використовуйте абсолютну дельту" };
        }
        const pct = ((num - old) / old) * 100;
        const result = { result: Number(pct.toFixed(12)) };
        setCachedResult(cacheKey, result);
        return result;
      }

      case "aggregateRevenue": {
        // правило: revenue = payments - refunds - chargebacks (усе в USD)
        const fxRows = p.fxRows ?? [];
        
        // Optimized: use native numbers for better performance with large datasets
        let payments = 0;
        let refunds = 0;
        let chargebacks = 0;

        for (let i = 0; i < fxRows.length; i++) {
          const r = fxRows[i];
          const usd = r.amount * (r.currency.toUpperCase() === "USD" ? 1 : r.fxToUSD);
          
          if (r.kind === "payment") {
            payments += usd;
          } else if (r.kind === "refund") {
            refunds += Math.abs(usd); // від'ємна корекція
          } else if (r.kind === "chargeback") {
            chargebacks += Math.abs(usd);
          }
        }

        const revenue = payments - refunds - chargebacks;
        const result = {
          result: Number(revenue.toFixed(15)),
          breakdown: {
            payments: Number(payments.toFixed(2)),
            refunds: Number(refunds.toFixed(2)),
            chargebacks: Number(chargebacks.toFixed(2)),
          }
        };
        setCachedResult(cacheKey, result);
        return result;
      }

      case "batchAggregateRevenue": {
        // Batch processing for very large datasets
        const fxRows = p.fxRows ?? [];
        const batchSize = p.batchSize ?? 1000;
        
        if (fxRows.length <= batchSize) {
          // Use regular aggregateRevenue for smaller datasets
          return calcTool.execute({ ...p, op: "aggregateRevenue", batchSize: p.batchSize });
        }

        let totalPayments = 0;
        let totalRefunds = 0;
        let totalChargebacks = 0;

        // Process in batches to avoid memory issues
        for (let i = 0; i < fxRows.length; i += batchSize) {
          const batch = fxRows.slice(i, i + batchSize);
          const batchResult = await calcTool.execute({
            op: "aggregateRevenue",
            fxRows: batch,
            batchSize: p.batchSize
          });
          
          if (batchResult.breakdown) {
            totalPayments += batchResult.breakdown.payments;
            totalRefunds += batchResult.breakdown.refunds;
            totalChargebacks += batchResult.breakdown.chargebacks;
          }
        }

        const revenue = totalPayments - totalRefunds - totalChargebacks;
        const result = {
          result: Number(revenue.toFixed(15)),
          breakdown: {
            payments: Number(totalPayments.toFixed(2)),
            refunds: Number(totalRefunds.toFixed(2)),
            chargebacks: Number(totalChargebacks.toFixed(2)),
          },
          processedBatches: Math.ceil(fxRows.length / batchSize)
        };
        setCachedResult(cacheKey, result);
        return result;
      }

      case "sumMetric": {
        // Сумування метрики за період (для FOREX та інших метрик)
        const values = p.values ?? [];
        const metric = p.metric ?? "unknown";
        const from = p.from ?? "unknown";
        const to = p.to ?? "unknown";
        
        if (values.length === 0) {
          return { 
            result: 0,
            note: `No values found for metric "${metric}" from ${from} to ${to}`
          };
        }

        let sum = 0;
        for (let i = 0; i < values.length; i++) {
          sum += values[i];
        }

        const result = {
          result: Number(sum.toFixed(2)),
          metric,
          period: `${from} to ${to}`,
          count: values.length
        };
        console.log('🔢 TypeScript sumMetric result:', result);
        setCachedResult(cacheKey, result);
        return result;
      }
    }
  },
} as const;
