#!/usr/bin/env python3
"""
High-performance file processing microservice
Optimized for large CSV/Excel files with thousands of rows
"""

import json
import sys
import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional
import io
import re
from decimal import Decimal, getcontext

# Set high precision for financial calculations
getcontext().prec = 28

def extract_metric_values(file_content: str, metric_name: str, date_from: str = None, date_to: str = None) -> Dict[str, Any]:
    """
    Extract metric values from file content using optimized pandas operations
    Supports CSV, TSV, JSON formats
    """
    try:
        df = None
        json_parsed = False
        
        # Try to parse as JSON first
        if file_content.strip().startswith('{') or file_content.strip().startswith('['):
            try:
                json_data = json.loads(file_content)
                if isinstance(json_data, list):
                    # Array of objects
                    df = pd.DataFrame(json_data)
                    json_parsed = True
                elif isinstance(json_data, dict):
                    # Single object or nested structure
                    if 'data' in json_data:
                        df = pd.DataFrame(json_data['data'])
                        json_parsed = True
                    elif 'rows' in json_data:
                        df = pd.DataFrame(json_data['rows'])
                        json_parsed = True
                    elif 'values' in json_data:
                        df = pd.DataFrame(json_data['values'])
                        json_parsed = True
                    else:
                        # Try to flatten the dictionary
                        df = pd.DataFrame([json_data])
                        json_parsed = True
                else:
                    return {"error": f"Unsupported JSON format: {type(json_data)}"}
            except json.JSONDecodeError:
                # Not JSON, continue to CSV parsing
                pass
        
        # Only try CSV parsing if JSON parsing failed
        if not json_parsed:
            try:
                if file_content.strip().startswith(','):
                    # CSV format
                    df = pd.read_csv(io.StringIO(file_content))
                else:
                    # Try to detect format and parse accordingly
                    lines = file_content.strip().split('\n')
                    if len(lines) > 0 and '\t' in lines[0]:
                        # TSV format
                        df = pd.read_csv(io.StringIO(file_content), sep='\t')
                    else:
                        # Try CSV with different separators
                        df = pd.read_csv(io.StringIO(file_content))
            except Exception as csv_error:
                return {
                    "error": f"Unable to parse file content as CSV/TSV: {str(csv_error)}",
                    "file_preview": file_content[:500] + "..." if len(file_content) > 500 else file_content,
                    "metric": metric_name
                }
        
        if df is None or df.empty:
            return {
                "error": "Unable to parse file content or file is empty",
                "file_preview": file_content[:500] + "..." if len(file_content) > 500 else file_content,
                "metric": metric_name
            }
        
        # Normalize column names (remove spaces, convert to lowercase)
        df.columns = df.columns.str.strip().str.lower().str.replace(' ', '_')
        
        # Find metric column (flexible matching)
        metric_patterns = [
            metric_name.lower().replace(' ', '_'),
            metric_name.lower().replace(' ', ''),
            metric_name.lower(),
            metric_name.upper(),
            metric_name
        ]
        
        metric_column = None
        for pattern in metric_patterns:
            if pattern in df.columns:
                metric_column = pattern
                break
        
        if metric_column is None:
            # Try partial matching
            for col in df.columns:
                if metric_name.lower() in col.lower() or col.lower() in metric_name.lower():
                    metric_column = col
                    break
        
        # If still not found, check if metric is in the data itself (not column name)
        if metric_column is None:
            # Look for metric name in the data rows
            for col in df.columns:
                if df[col].dtype == 'object':  # String column
                    # Check if any row contains the metric name
                    mask = df[col].astype(str).str.contains(re.escape(metric_name), case=False, na=False)
                    if mask.any():
                        # Find the value column (usually next column or 'value' column)
                        value_cols = [c for c in df.columns if c != col and ('value' in c.lower() or 'amount' in c.lower() or df[c].dtype in ['int64', 'float64'])]
                        if value_cols:
                            # Filter rows where metric name matches
                            filtered_df = df[mask]
                            if len(filtered_df) > 0:
                                metric_column = value_cols[0]  # Use first numeric column
                                df = filtered_df  # Use filtered data
                                break
        
        if metric_column is None:
            return {
                "error": f"Metric '{metric_name}' not found in file",
                "available_columns": list(df.columns),
                "sample_data": df.head(3).to_dict('records') if len(df) > 0 else []
            }
        
        # Filter by date if provided
        if date_from or date_to:
            date_columns = [col for col in df.columns if 'date' in col.lower() or 'week' in col.lower()]
            if date_columns:
                date_col = date_columns[0]
                try:
                    df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
                    if date_from:
                        df = df[df[date_col] >= pd.to_datetime(date_from)]
                    if date_to:
                        df = df[df[date_col] <= pd.to_datetime(date_to)]
                except:
                    pass  # Skip date filtering if parsing fails
        
        # Extract numeric values
        values = df[metric_column].dropna()
        
        # Convert to numeric, handling various formats
        numeric_values = []
        for val in values:
            try:
                if isinstance(val, (int, float)):
                    numeric_values.append(float(val))
                elif isinstance(val, str):
                    # Remove currency symbols, commas, etc.
                    clean_val = re.sub(r'[^\d.-]', '', val)
                    if clean_val:
                        numeric_values.append(float(clean_val))
            except:
                continue
        
        return {
            "values": numeric_values,
            "metric": metric_name,
            "column_used": metric_column,
            "total_rows": len(df),
            "valid_values": len(numeric_values),
            "date_range": {
                "from": date_from,
                "to": date_to
            },
            "sample_data": df.head(5).to_dict('records') if len(df) > 0 else []
        }
        
    except Exception as e:
        return {
            "error": f"Error processing file: {str(e)}",
            "metric": metric_name
        }

def extract_multiple_metrics(file_content: str, metrics: List[str], date_from: str = None, date_to: str = None) -> Dict[str, Any]:
    """
    Extract multiple metrics from file content in one pass
    Supports CSV, TSV, JSON formats
    """
    try:
        df = None
        json_parsed = False
        
        # Try to parse as JSON first
        if file_content.strip().startswith('{') or file_content.strip().startswith('['):
            try:
                json_data = json.loads(file_content)
                if isinstance(json_data, list):
                    # Array of objects
                    df = pd.DataFrame(json_data)
                    json_parsed = True
                elif isinstance(json_data, dict):
                    # Single object or nested structure
                    if 'data' in json_data:
                        df = pd.DataFrame(json_data['data'])
                        json_parsed = True
                    elif 'rows' in json_data:
                        df = pd.DataFrame(json_data['rows'])
                        json_parsed = True
                    elif 'values' in json_data:
                        df = pd.DataFrame(json_data['values'])
                        json_parsed = True
                    else:
                        # Try to flatten the dictionary
                        df = pd.DataFrame([json_data])
                        json_parsed = True
                else:
                    return {"error": f"Unsupported JSON format: {type(json_data)}"}
            except json.JSONDecodeError:
                # Not JSON, continue to CSV parsing
                pass
        
        # Only try CSV parsing if JSON parsing failed
        if not json_parsed:
            try:
                if file_content.strip().startswith(','):
                    df = pd.read_csv(io.StringIO(file_content))
                else:
                    lines = file_content.strip().split('\n')
                    if len(lines) > 0 and '\t' in lines[0]:
                        df = pd.read_csv(io.StringIO(file_content), sep='\t')
                    else:
                        df = pd.read_csv(io.StringIO(file_content))
            except Exception as csv_error:
                return {
                    "error": f"Unable to parse file content as CSV/TSV: {str(csv_error)}",
                    "file_preview": file_content[:500] + "..." if len(file_content) > 500 else file_content,
                    "metrics": metrics
                }
        
        if df is None or df.empty:
            return {
                "error": "Unable to parse file content or file is empty",
                "file_preview": file_content[:500] + "..." if len(file_content) > 500 else file_content,
                "metrics": metrics
            }
        
        # Normalize column names
        df.columns = df.columns.str.strip().str.lower().str.replace(' ', '_')
        
        # Filter by date if provided
        if date_from or date_to:
            date_columns = [col for col in df.columns if 'date' in col.lower() or 'week' in col.lower()]
            if date_columns:
                date_col = date_columns[0]
                try:
                    df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
                    if date_from:
                        df = df[df[date_col] >= pd.to_datetime(date_from)]
                    if date_to:
                        df = df[df[date_col] <= pd.to_datetime(date_to)]
                except:
                    pass
        
        results = {}
        for metric in metrics:
            # Find metric column or data
            metric_column = None
            filtered_df = df.copy()
            
            # First try column name matching
            metric_patterns = [
                metric.lower().replace(' ', '_'),
                metric.lower().replace(' ', ''),
                metric.lower(),
                metric.upper(),
                metric
            ]
            
            for pattern in metric_patterns:
                if pattern in df.columns:
                    metric_column = pattern
                    break
            
            if metric_column is None:
                # Try partial matching
                for col in df.columns:
                    if metric.lower() in col.lower() or col.lower() in metric.lower():
                        metric_column = col
                        break
            
            # If still not found, check if metric is in the data itself
            if metric_column is None:
                for col in df.columns:
                    if df[col].dtype == 'object':  # String column
                        # Check if any row contains the metric name
                        mask = df[col].astype(str).str.contains(re.escape(metric), case=False, na=False)
                        if mask.any():
                            # Find the value column
                            value_cols = [c for c in df.columns if c != col and ('value' in c.lower() or 'amount' in c.lower() or df[c].dtype in ['int64', 'float64'])]
                            if value_cols:
                                # Filter rows where metric name matches
                                filtered_df = df[mask]
                                if len(filtered_df) > 0:
                                    metric_column = value_cols[0]  # Use first numeric column
                                    break
            
            if metric_column and metric_column in filtered_df.columns:
                values = filtered_df[metric_column].dropna()
                numeric_values = []
                for val in values:
                    try:
                        if isinstance(val, (int, float)):
                            numeric_values.append(float(val))
                        elif isinstance(val, str):
                            clean_val = re.sub(r'[^\d.-]', '', val)
                            if clean_val:
                                numeric_values.append(float(clean_val))
                    except:
                        continue
                
                results[metric] = {
                    "values": numeric_values,
                    "column_used": metric_column,
                    "valid_values": len(numeric_values)
                }
            else:
                results[metric] = {
                    "error": f"Metric '{metric}' not found",
                    "values": []
                }
        
        return {
            "results": results,
            "total_rows": len(df),
            "available_columns": list(df.columns),
            "date_range": {
                "from": date_from,
                "to": date_to
            }
        }
        
    except Exception as e:
        return {
            "error": f"Error processing file: {str(e)}",
            "metrics": metrics
        }

def process_file_request(data: Dict[str, Any]) -> Dict[str, Any]:
    """Main file processing dispatcher"""
    operation = data.get("operation")
    
    try:
        if operation == "extract_metric":
            file_content = data.get("file_content", "")
            metric_name = data.get("metric_name", "")
            date_from = data.get("date_from")
            date_to = data.get("date_to")
            
            return extract_metric_values(file_content, metric_name, date_from, date_to)
            
        elif operation == "extract_multiple_metrics":
            file_content = data.get("file_content", "")
            metrics = data.get("metrics", [])
            date_from = data.get("date_from")
            date_to = data.get("date_to")
            
            return extract_multiple_metrics(file_content, metrics, date_from, date_to)
            
        else:
            return {"error": f"Unknown operation: {operation}"}
            
    except Exception as e:
        return {"error": f"Processing error: {str(e)}"}

def main():
    """Main entry point for the file processing service"""
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())
        
        # Process the file request
        result = process_file_request(input_data)
        
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
