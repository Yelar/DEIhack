from flask import Flask, request, jsonify
from flask_cors import CORS
import anthropic
from consts import prompt
from flask_socketio import SocketIO, send


app = Flask(__name__)
CORS(app) 
socketio = SocketIO(app, cors_allowed_origins="*")

@app.route('/transcript', methods=['POST'])
def transcript():
    data = request.get_json()
    transcript_text = data.get('transcript')
    
    if not transcript_text:
        return jsonify({'error': 'No transcript provided'}), 400
    client = anthropic.Anthropic(api_key="")

    response = client.messages.create(
        model="claude-3-5-sonnet-20241022", 
        max_tokens=1000,
        temperature=0.0,               
        messages=[
            {"role": "user", "content": prompt + "\n" + transcript_text}
        ]
    )

    summary = response.content[0].text
    print("Received transcript:", transcript_text)

    print("Summary of transcript:", summary)

    return jsonify({
        'message': 'Transcript received successfully!',
        'summary': summary
    }), 200


@app.route("/summarize", methods=['POST'])
def summarize():
    data = request.get_json()
    text_content = data.get('text')

    if not text_content:
        return jsonify({'error': 'No text content provided'}), 400

    # Here you can implement any processing logic for the text content
    # For example, summarizing or analyzing the text content

    processed_content = f"Processed content: {text_content}"  # Placeholder for actual processing logic

    return jsonify({
        'message': 'Text content received successfully!',
        'processed_content': processed_content
    }), 200



@socketio.on("message") 
def handle_message(msg):
    print(f"Received message: {msg}")
    send(f"Server received: {msg}", broadcast=True)

@socketio.on("connect")
def print_hello():
    print("Connected successfully to frontend")
    

if __name__ == '__main__':
    app.run(debug=True)
