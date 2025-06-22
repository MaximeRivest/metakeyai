#!/usr/bin/env python3
"""
Data Processor Script for MetaKeyAI
Processes and transforms clipboard data in various formats.
"""

import sys
import json
import csv
import re
from io import StringIO
from typing import Dict, List, Any, Union

def process_data(text: str, operation: str = 'analyze') -> Dict[str, Any]:
    """Process data based on detected format and requested operation."""
    
    # Detect data format
    data_format = detect_format(text)
    
    result = {
        'format': data_format,
        'operation': operation,
        'input_size': len(text),
        'processed_data': None,
        'summary': None,
        'error': None
    }
    
    try:
        if data_format == 'json':
            result.update(process_json(text, operation))
        elif data_format == 'csv':
            result.update(process_csv(text, operation))
        elif data_format == 'numbers':
            result.update(process_numbers(text, operation))
        elif data_format == 'urls':
            result.update(process_urls(text, operation))
        elif data_format == 'emails':
            result.update(process_emails(text, operation))
        elif data_format == 'text_list':
            result.update(process_text_list(text, operation))
        else:
            result.update(process_plain_text(text, operation))
            
    except Exception as e:
        result['error'] = str(e)
    
    return result

def detect_format(text: str) -> str:
    """Detect the format of the input data."""
    
    text = text.strip()
    
    # JSON detection
    if (text.startswith('{') and text.endswith('}')) or (text.startswith('[') and text.endswith(']')):
        try:
            json.loads(text)
            return 'json'
        except:
            pass
    
    # CSV detection
    if '\n' in text and ',' in text:
        lines = text.split('\n')
        if len(lines) > 1:
            first_line_commas = text.split('\n')[0].count(',')
            if first_line_commas > 0 and all(line.count(',') == first_line_commas for line in lines[:3] if line.strip()):
                return 'csv'
    
    # Numbers detection (list of numbers)
    numbers_pattern = re.findall(r'-?\d+\.?\d*', text)
    if len(numbers_pattern) > 3 and len(' '.join(numbers_pattern)) / len(text) > 0.5:
        return 'numbers'
    
    # URLs detection
    url_pattern = re.findall(r'https?://[^\s]+', text)
    if len(url_pattern) > 2:
        return 'urls'
    
    # Emails detection
    email_pattern = re.findall(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', text)
    if len(email_pattern) > 2:
        return 'emails'
    
    # Text list detection (each line is an item)
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    if len(lines) > 3 and all(len(line) < 200 for line in lines):
        return 'text_list'
    
    return 'plain_text'

def process_json(text: str, operation: str) -> Dict[str, Any]:
    """Process JSON data."""
    
    data = json.loads(text)
    
    if operation == 'analyze':
        return analyze_json(data)
    elif operation == 'prettify':
        return {'processed_data': json.dumps(data, indent=2, sort_keys=True)}
    elif operation == 'minify':
        return {'processed_data': json.dumps(data, separators=(',', ':'))}
    else:
        return {'processed_data': data}

def analyze_json(data: Any) -> Dict[str, Any]:
    """Analyze JSON structure."""
    
    def count_types(obj, counts=None):
        if counts is None:
            counts = {'objects': 0, 'arrays': 0, 'strings': 0, 'numbers': 0, 'booleans': 0, 'nulls': 0}
        
        if isinstance(obj, dict):
            counts['objects'] += 1
            for value in obj.values():
                count_types(value, counts)
        elif isinstance(obj, list):
            counts['arrays'] += 1
            for item in obj:
                count_types(item, counts)
        elif isinstance(obj, str):
            counts['strings'] += 1
        elif isinstance(obj, (int, float)):
            counts['numbers'] += 1
        elif isinstance(obj, bool):
            counts['booleans'] += 1
        elif obj is None:
            counts['nulls'] += 1
        
        return counts
    
    type_counts = count_types(data)
    
    return {
        'summary': {
            'type': type(data).__name__,
            'size': len(json.dumps(data)),
            'type_counts': type_counts,
            'total_items': sum(type_counts.values())
        }
    }

def process_csv(text: str, operation: str) -> Dict[str, Any]:
    """Process CSV data."""
    
    reader = csv.reader(StringIO(text))
    rows = list(reader)
    
    if operation == 'analyze':
        return analyze_csv(rows)
    elif operation == 'to_json':
        return csv_to_json(rows)
    else:
        return {'processed_data': rows}

def analyze_csv(rows: List[List[str]]) -> Dict[str, Any]:
    """Analyze CSV structure."""
    
    if not rows:
        return {'summary': {'error': 'Empty CSV'}}
    
    num_rows = len(rows)
    num_cols = len(rows[0]) if rows else 0
    
    return {
        'summary': {
            'rows': num_rows,
            'columns': num_cols,
            'headers': rows[0] if num_rows > 0 else []
        }
    }

def csv_to_json(rows: List[List[str]]) -> Dict[str, Any]:
    """Convert CSV to JSON."""
    
    if not rows:
        return {'processed_data': []}
    
    headers = rows[0]
    data_rows = rows[1:]
    
    json_data = []
    for row in data_rows:
        row_dict = {}
        for i, value in enumerate(row):
            header = headers[i] if i < len(headers) else f'column_{i+1}'
            row_dict[header] = value
        json_data.append(row_dict)
    
    return {'processed_data': json.dumps(json_data, indent=2)}

def process_numbers(text: str, operation: str) -> Dict[str, Any]:
    """Process numeric data."""
    
    numbers = re.findall(r'-?\d+\.?\d*', text)
    numbers = [float(n) for n in numbers]
    
    if operation == 'analyze':
        return analyze_numbers(numbers)
    elif operation == 'sum':
        return {'processed_data': f'Sum: {sum(numbers)}'}
    else:
        return {'processed_data': numbers}

def analyze_numbers(numbers: List[float]) -> Dict[str, Any]:
    """Analyze numeric data."""
    
    if not numbers:
        return {'summary': {'error': 'No numbers found'}}
    
    return {
        'summary': {
            'count': len(numbers),
            'min': min(numbers),
            'max': max(numbers),
            'sum': sum(numbers),
            'average': sum(numbers) / len(numbers)
        }
    }

def process_urls(text: str, operation: str) -> Dict[str, Any]:
    """Process URL data."""
    
    urls = re.findall(r'https?://[^\s]+', text)
    
    if operation == 'analyze':
        return analyze_urls(urls)
    else:
        return {'processed_data': urls}

def analyze_urls(urls: List[str]) -> Dict[str, Any]:
    """Analyze URL data."""
    
    domains = {}
    
    for url in urls:
        domain_match = re.search(r'https?://([^/]+)', url)
        if domain_match:
            domain = domain_match.group(1)
            domains[domain] = domains.get(domain, 0) + 1
    
    return {
        'summary': {
            'total_urls': len(urls),
            'unique_domains': len(domains),
            'top_domains': sorted(domains.items(), key=lambda x: x[1], reverse=True)[:5]
        }
    }

def process_emails(text: str, operation: str) -> Dict[str, Any]:
    """Process email data."""
    
    emails = re.findall(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', text)
    
    if operation == 'analyze':
        return analyze_emails(emails)
    else:
        return {'processed_data': emails}

def analyze_emails(emails: List[str]) -> Dict[str, Any]:
    """Analyze email data."""
    
    domains = {}
    
    for email in emails:
        domain = email.split('@')[1]
        domains[domain] = domains.get(domain, 0) + 1
    
    return {
        'summary': {
            'total_emails': len(emails),
            'unique_emails': len(set(emails)),
            'unique_domains': len(domains)
        }
    }

def process_text_list(text: str, operation: str) -> Dict[str, Any]:
    """Process text list data."""
    
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    
    if operation == 'analyze':
        return analyze_text_list(lines)
    elif operation == 'sort':
        return {'processed_data': '\n'.join(sorted(lines))}
    else:
        return {'processed_data': lines}

def analyze_text_list(lines: List[str]) -> Dict[str, Any]:
    """Analyze text list data."""
    
    return {
        'summary': {
            'total_items': len(lines),
            'unique_items': len(set(lines)),
            'duplicates': len(lines) - len(set(lines))
        }
    }

def process_plain_text(text: str, operation: str) -> Dict[str, Any]:
    """Process plain text data."""
    
    if operation == 'analyze':
        words = text.split()
        return {
            'summary': {
                'characters': len(text),
                'words': len(words),
                'lines': len(text.split('\n'))
            }
        }
    else:
        return {'processed_data': text}

# Daemon-friendly entry point
def main(text: str) -> str:
    result = process_data(text, operation='analyze')
    return json.dumps(result, indent=2)

# CLI wrapper
def _cli():
    try:
        inp = sys.stdin.read().strip()
        if not inp:
            print(json.dumps({'error': 'No input text'}))
            return
        print(main(inp))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)

if __name__ == '__main__':
    _cli()
