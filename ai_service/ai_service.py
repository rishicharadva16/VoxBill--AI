from flask import Flask, request, jsonify
from flask_cors import CORS
from order_parser import parse_order
import os
import json
import re
import urllib.request
import urllib.error

app = Flask(__name__)
CORS(app)


def extract_json_block(text):
    if not text:
        return None
    fence_match = re.search(r'```json\s*(\{[\s\S]*?\})\s*```', text, re.IGNORECASE)
    if fence_match:
        try:
            return json.loads(fence_match.group(1))
        except Exception:
            pass
    obj_match = re.search(r'(\{[\s\S]*\})', text)
    if obj_match:
        try:
            return json.loads(obj_match.group(1))
        except Exception:
            return None
    return None


def extract_metadata(text):
    table_no = None
    customer_name = None
    notes = []

    for raw_line in text.split('\n'):
        line = raw_line.strip()
        if not line:
            continue

        t_match = re.match(r'^[Tt](?:able)?\s*[-–—:\s]*\s*(\d+)', line)
        if t_match:
            table_no = int(t_match.group(1))
            continue

        c_match = re.match(r'^[Cc](?:ustomer)?\s*[-–—:\s]*\s*([A-Za-z][A-Za-z\s]*)', line)
        if c_match:
            customer_name = c_match.group(1).strip()
            continue

        n_match = re.match(r'^[Nn](?:ote)?\s*[-–—:\s]*\s*(.+)', line)
        if n_match:
            notes.append(n_match.group(1).strip())

    return {
        'tableNo': table_no,
        'customerName': customer_name,
        'notes': ' - '.join(notes)
    }


def call_anthropic_vision(image_base64, mime_type):
    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        raise RuntimeError('ANTHROPIC_API_KEY is not configured')

    model = os.environ.get('ANTHROPIC_VISION_MODEL', 'claude-3-5-sonnet-20241022')
    payload = {
        'model': model,
        'max_tokens': 800,
        'temperature': 0,
        'messages': [
            {
                'role': 'user',
                'content': [
                    {
                        'type': 'text',
                        'text': (
                            'Read this restaurant handwritten order slip and return ONLY JSON with keys: '
                            'table, customer, notes, lines. '
                            'Rules: '\
                            '1) Keep coded lines exactly in "code x qty" form when possible. '\
                            '2) Keep one slip line per array entry in lines. '\
                            '3) If unsure, keep best guess text in lines. '\
                            '4) No markdown, no explanation.'
                        )
                    },
                    {
                        'type': 'image',
                        'source': {
                            'type': 'base64',
                            'media_type': mime_type,
                            'data': image_base64
                        }
                    }
                ]
            }
        ]
    }

    req = urllib.request.Request(
        'https://api.anthropic.com/v1/messages',
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'x-api-key': api_key,
            'anthropic-version': '2023-06-01'
        },
        method='POST'
    )

    timeout_sec = int(os.environ.get('RUSH_OCR_TIMEOUT_SEC', '25'))
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            content = data.get('content', [])
            text_parts = [p.get('text', '') for p in content if p.get('type') == 'text']
            return '\n'.join(text_parts).strip(), model
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='ignore')
        raise RuntimeError(f'Anthropic API error {e.code}: {body[:400]}')
    except Exception as e:
        raise RuntimeError(f'Anthropic request failed: {str(e)}')

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"}), 200

@app.route('/process-order', methods=['POST'])
def process_order():
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({
            "error": "Missing 'text' in request body."
        }), 400

    text = data['text']
    token = data.get('token', None)
    backend_url = os.environ.get(
        'BACKEND_URL', 'http://127.0.0.1:4000')

    try:
        result = parse_order(
            text,
            backend_url=backend_url,
            token=token
        )
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/process-rush-image', methods=['POST'])
def process_rush_image():
    data = request.get_json() or {}
    image_base64 = data.get('imageBase64')
    mime_type = data.get('mimeType', 'image/jpeg')
    token = data.get('token', None)
    backend_url = data.get('backendUrl') or os.environ.get('BACKEND_URL', 'http://127.0.0.1:4000')

    if not image_base64:
        return jsonify({'error': "Missing 'imageBase64' in request body."}), 400

    try:
        vision_text, model = call_anthropic_vision(image_base64, mime_type)
        parsed_json = extract_json_block(vision_text)

        if parsed_json and isinstance(parsed_json, dict):
            lines = parsed_json.get('lines', [])
            if not isinstance(lines, list):
                lines = []

            assembled = []
            if parsed_json.get('table'):
                assembled.append(f"T - {parsed_json.get('table')}")
            if parsed_json.get('customer'):
                assembled.append(f"C - {parsed_json.get('customer')}")
            assembled.extend([str(x) for x in lines if str(x).strip()])
            if parsed_json.get('notes'):
                assembled.append(f"N - {parsed_json.get('notes')}")

            extracted_text = '\n'.join(assembled).strip()
            if not extracted_text:
                extracted_text = vision_text
        else:
            extracted_text = vision_text

        parsed_order = parse_order(
            extracted_text,
            backend_url=backend_url,
            token=token
        )
        meta = extract_metadata(extracted_text)

        result = {
            'tableNo': meta.get('tableNo') if meta.get('tableNo') is not None else parsed_order.get('tableNumber'),
            'customerName': meta.get('customerName'),
            'notes': meta.get('notes', ''),
            'items': parsed_order.get('items', []),
            'grandTotal': parsed_order.get('grandTotal', 0),
            'droppedInvalidCodes': parsed_order.get('droppedInvalidCodes', 0),
            'rawText': extracted_text,
            'providerMeta': {
                'provider': 'anthropic',
                'model': model
            }
        }
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(
        host='0.0.0.0',
        port=port,
        debug=False,
        threaded=True
    )
