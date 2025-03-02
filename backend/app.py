from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS

@app.route('/transcript', methods=['POST'])
def transcript():
    data = request.get_json()
    transcript_text = data.get('transcript')
    
    if not transcript_text:
        return jsonify({'error': 'No transcript provided'}), 400
    
    print("Received transcript:", transcript_text)
    
    return jsonify({'message': 'Transcript received successfully!'}), 200

if __name__ == '__main__':
    app.run(debug=True)
