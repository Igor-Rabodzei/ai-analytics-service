#!/usr/bin/env python3
"""
High-performance financial calculations using Python with NumPy
Optimized for large datasets with thousands of rows
"""

import json
import sys
import numpy as np
from decimal import Decimal, getcontext
from typing import Dict, List, Any, Optional

# Set high precision for financial calculations
getcontext().prec = 28

def calculate_sum(numbers: List[float]) -> float:
    """Optimized sum calculation using NumPy"""
    if not numbers:
        return 0.0
    return float(np.sum(numbers))

def calculate_avg(numbers: List[float]) -> float:
    """Optimized average calculation using NumPy"""
    if not numbers:
        return 0.0
    return float(np.mean(numbers))

def calculate_romi(num: float, den: float) -> Optional[float]:
    """Calculate ROMI (Return on Marketing Investment)"""
    if den == 0:
        return None
    return float(Decimal(str(num)) / Decimal(str(den)))

def calculate_delta_pct(old: float, num: float) -> Dict[str, Any]:
    """Calculate percentage change"""
    if old == 0:
        return {
            "result": None,
            "note": "old == 0 → % зміна не визначена, використовуйте абсолютну дельту"
        }
    
    pct = ((num - old) / old) * 100
    return {"result": float(Decimal(str(pct)).quantize(Decimal('0.000000000001')))}

def aggregate_revenue(fx_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    High-performance revenue aggregation using NumPy
    Optimized for large datasets (10k+ rows)
    """
    if not fx_rows:
        return {
            "result": 0.0,
            "breakdown": {"payments": 0.0, "refunds": 0.0, "chargebacks": 0.0}
        }
    
    # Convert to NumPy arrays for vectorized operations
    amounts = np.array([row["amount"] for row in fx_rows])
    currencies = np.array([row.get("currency", "USD").upper() for row in fx_rows])
    fx_rates = np.array([row.get("fxToUSD", 1.0) for row in fx_rows])
    kinds = np.array([row.get("kind", "payment") for row in fx_rows])
    
    # Convert to USD using vectorized operations
    usd_amounts = amounts * np.where(currencies == "USD", 1.0, fx_rates)
    
    # Calculate totals by kind using boolean indexing (much faster than loops)
    payments = np.sum(usd_amounts[kinds == "payment"])
    refunds = np.sum(np.abs(usd_amounts[kinds == "refund"]))
    chargebacks = np.sum(np.abs(usd_amounts[kinds == "chargeback"]))
    
    revenue = payments - refunds - chargebacks
    
    return {
        "result": float(Decimal(str(revenue)).quantize(Decimal('0.000000000000001'))),
        "breakdown": {
            "payments": float(Decimal(str(payments)).quantize(Decimal('0.01'))),
            "refunds": float(Decimal(str(refunds)).quantize(Decimal('0.01'))),
            "chargebacks": float(Decimal(str(chargebacks)).quantize(Decimal('0.01')))
        }
    }

def calculate_sum_metric(values: List[float], metric: str, from_date: str, to_date: str) -> Dict[str, Any]:
    """Calculate sum of metric values over a period"""
    if not values:
        return {
            "result": 0,
            "note": f'No values found for metric "{metric}" from {from_date} to {to_date}'
        }
    
    total = float(np.sum(values))
    return {
        "result": float(Decimal(str(total)).quantize(Decimal('0.01'))),
        "metric": metric,
        "period": f"{from_date} to {to_date}",
        "count": len(values)
    }

def process_calculation(data: Dict[str, Any]) -> Dict[str, Any]:
    """Main calculation dispatcher"""
    op = data.get("op")
    
    try:
        if op == "sum":
            numbers = data.get("numbers", [])
            return {"result": calculate_sum(numbers)}
            
        elif op == "avg":
            numbers = data.get("numbers", [])
            return {"result": calculate_avg(numbers)}
            
        elif op == "romi":
            num = data.get("num", 0)
            den = data.get("den", 0)
            return {"result": calculate_romi(num, den)}
            
        elif op == "deltaPct":
            old = data.get("old", 0)
            num = data.get("num", 0)
            return calculate_delta_pct(old, num)
            
        elif op == "aggregateRevenue":
            fx_rows = data.get("fxRows", [])
            return aggregate_revenue(fx_rows)
            
        elif op == "sumMetric":
            values = data.get("values", [])
            metric = data.get("metric", "unknown")
            from_date = data.get("from", "unknown")
            to_date = data.get("to", "unknown")
            return calculate_sum_metric(values, metric, from_date, to_date)
            
        else:
            return {"error": f"Unknown operation: {op}"}
            
    except Exception as e:
        return {"error": f"Calculation error: {str(e)}"}

def main():
    """Main entry point for the Python calculation service"""
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())
        
        # Process the calculation
        result = process_calculation(input_data)
        
        # Output result to stdout
        print(json.dumps(result, ensure_ascii=False))
        
    except json.JSONDecodeError as e:
        error_result = {"error": f"Invalid JSON input: {str(e)}"}
        print(json.dumps(error_result))
        sys.exit(1)
    except Exception as e:
        error_result = {"error": f"Unexpected error: {str(e)}"}
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    main()
