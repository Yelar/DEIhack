from flask import Flask, request, jsonify
from flask_cors import CORS
import anthropic
from consts import prompt
import os
import dotenv
from langchain.tools import tool
from langchain_anthropic import ChatAnthropic
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage

dotenv.load_dotenv()

app = Flask(__name__)
CORS(app) 

# Define the multiplication tool
@tool
def multiply(a: float, b: float) -> float:
    """Multiply two numbers together."""
    print(f"Multiplying {a} and {b}")
    return a * b

# Set up LangChain agent
def setup_agent():
    # Initialize the LLM
    llm = ChatAnthropic(
        model="claude-3-5-sonnet-20241022",
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"),
        temperature=0
    )
    
    # Define tools
    tools = [multiply]
    
    # Create prompt
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a helpful assistant that can use tools to solve math problems."),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])
    
    # Create agent
    agent = create_tool_calling_agent(llm, tools, prompt)
    
    # Create agent executor
    return AgentExecutor(agent=agent, tools=tools, verbose=True)

# Initialize the agent executor
agent_executor = setup_agent()

@app.route('/calculate', methods=['POST'])
def calculate():
    data = request.get_json()
    user_input = data.get('query')
    
    if not user_input:
        return jsonify({'error': 'No query provided'}), 400
    
    try:
        result = agent_executor.invoke({"input": user_input})
        return jsonify({
            'result': result['output'],
            'success': True
        }), 200
    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({
            'error': str(e),
            'success': False
        }), 500

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
