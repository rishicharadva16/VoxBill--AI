from flask import Flask, request, jsonify
from flask_cors import CORS
from order_parser import parse_order

app = Flask(__name__)
# Enable CORS so frontend Node.js / HTML can call it directly if needed, or via Node.
CORS(app)

@app.route('/process-order', methods=['POST'])
def process_order():
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({"error": "Missing 'text' in request body."}), 400

    text = data['text']
    token = data.get('token', None)
    backend_url = 'http://127.0.0.1:4000'

    try:
        result = parse_order(text, backend_url=backend_url, token=token)
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Start the Flask development server
    app.run(debug=True, port=5000)
