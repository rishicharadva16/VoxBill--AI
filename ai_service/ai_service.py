from flask import Flask, request, jsonify
from flask_cors import CORS
from order_parser import parse_order
import os

app = Flask(__name__)
CORS(app)

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

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(
        host='0.0.0.0',
        port=port,
        debug=False,
        threaded=True
    )
