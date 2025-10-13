// tools/calc.ts
import { z } from "zod";
import { Decimal } from "decimal.js";

const calcParameters = z.object({
  op: z.enum(["sum", "avg", "romi", "deltaPct", "aggregateRevenue"]),
  numbers: z.array(z.number()).optional(), // для sum/avg
  num: z.number().optional(),              // поточне значення
  den: z.number().optional(),              // базове (для ROMI = num/den)
  old: z.number().optional(),              // для deltaPct
  fxRows: z.array(z.object({               // для aggregateRevenue
    amount: z.number(),                    // сума у локальній валюті або USD
    currency: z.string().default("USD"),
    fxToUSD: z.number().default(1),        // множник до USD (якщо currency != USD)
    kind: z.enum(["payment","refund","chargeback"]).default("payment"),
  })).optional()
}).strip();

export const calcTool = {
  parameters: calcParameters,
  // головне — вся математика тут, не в LLM
  execute: async (args: z.infer<typeof calcParameters>) => {
    const p = calcParameters.parse(args);

    const toDec = (x: number | undefined) => new Decimal(x ?? 0);

    switch (p.op) {
      case "sum": {
        const s = (p.numbers ?? []).reduce((acc: Decimal, n: number) => acc.plus(new Decimal(n)), new Decimal(0));
        return { result: s.toNumber() };
      }

      case "avg": {
        const arr = p.numbers ?? [];
        if (!arr.length) return { result: 0 };
        const s = arr.reduce((acc: Decimal, n: number) => acc.plus(new Decimal(n)), new Decimal(0));
        return { result: s.div(arr.length).toNumber() };
      }

      case "romi": {
        // ROMI = revenue / cost
        const num = toDec(p.num);
        const den = toDec(p.den);
        const romi = den.isZero() ? null : num.div(den);
        return { result: romi === null ? null : Number(romi.toSignificantDigits(12).toString()) };
      }

      case "deltaPct": {
        const old = toDec(p.old);
        const num = toDec(p.num);
        if (old.isZero()) {
          return { result: null, note: "old == 0 → % зміна не визначена, використовуйте абсолютну дельту" };
        }
        const pct = num.minus(old).div(old).times(100);
        return { result: Number(pct.toSignificantDigits(12).toString()) };
      }

      case "aggregateRevenue": {
        // правило: revenue = payments - refunds - chargebacks (усе в USD)
        let payments = new Decimal(0);
        let refunds = new Decimal(0);
        let chargebacks = new Decimal(0);

        for (const r of (p.fxRows ?? [])) {
          const usd = new Decimal(r.amount).times(r.currency.toUpperCase() === "USD" ? 1 : r.fxToUSD);
          if (r.kind === "payment") payments = payments.add(usd);
          else if (r.kind === "refund") refunds = refunds.add(usd.abs());       // від’ємна корекція
          else if (r.kind === "chargeback") chargebacks = chargebacks.add(usd.abs());
        }

        const revenue = payments.minus(refunds).minus(chargebacks);
        return {
          result: Number(revenue.toSignificantDigits(15).toString()),
          breakdown: {
            payments: payments.toNumber(),
            refunds: refunds.toNumber(),
            chargebacks: chargebacks.toNumber(),
          }
        };
      }
    }
  },
} as const;
