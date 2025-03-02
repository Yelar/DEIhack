from flask import Flask, request, jsonify
from flask_cors import CORS
import anthropic
from consts import prompt
import os
import dotenv

dotenv.load_dotenv()

app = Flask(__name__)
CORS(app) 

@app.route('/transcript', methods=['POST'])
def transcript():
    data = request.get_json()
    transcript_text = data.get('transcript')
    
    if not transcript_text:
        return jsonify({'error': 'No transcript provided'}), 400
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

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

if __name__ == '__main__':
    app.run(debug=True)
