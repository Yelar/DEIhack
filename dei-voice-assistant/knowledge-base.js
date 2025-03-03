// Add message listener for knowledge base data requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Knowledge base received message:", request);
  
  if (request.action === "getKnowledgeBaseData") {
    // Get the latest knowledge items
    try {
      const knowledgeItems = JSON.parse(localStorage.getItem('deiKnowledgeBase') || '[]');
      console.log("Sending knowledge items:", knowledgeItems);
      
      // Ensure the data is valid before sending
      if (Array.isArray(knowledgeItems)) {
        // Send the data back
        sendResponse({ knowledgeItems: knowledgeItems });
      } else {
        console.error("Invalid knowledge items format:", knowledgeItems);
        sendResponse({ error: "Invalid data format" });
      }
    } catch (error) {
      console.error("Error retrieving knowledge items:", error);
      sendResponse({ error: error.message });
    }
  }
  
  // Return true to indicate we might respond asynchronously
  return true;
});

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const knowledgeContainer = document.getElementById('knowledgeContainer');
  const textInput = document.getElementById('textInput');
  const recordButton = document.getElementById('recordButton');
  const recordButtonText = document.getElementById('recordButtonText');
  const recordIndicator = document.getElementById('recordIndicator');
  const addButton = document.getElementById('addButton');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const toast = document.getElementById('toast');
  
  // Variables for recording
  let mediaRecorder;
  let audioChunks = [];
  let isRecording = false;
  let recognition;
  
  // Display knowledge items on load
  displayKnowledgeItems();
  
  // Add event listeners
  recordButton.addEventListener('click', toggleRecording);
  addButton.addEventListener('click', addToKnowledgeBase);
  clearAllBtn.addEventListener('click', clearAllKnowledgeItems);
  
  // Text input events
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      addToKnowledgeBase();
    }
  });
  
  // Function to toggle recording
  async function toggleRecording() {
    if (!isRecording) {
      await startRecording();
    } else {
      stopRecording();
    }
  }
  
  // Function to start recording
  async function startRecording() {
    try {
      console.log("Starting recording");
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      
      // Set up media recorder events
      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };
      
      mediaRecorder.onstop = () => {
        // Finalizing recording - no need to create audio blob for playback
        console.log("Recording stopped");
      };
      
      // Start recording
      mediaRecorder.start();
      isRecording = true;
      
      // Update UI
      recordButtonText.textContent = "Stop";
      recordButton.classList.add("recording");
      recordIndicator.style.display = "block";
      
      // Start speech recognition
      if (!("webkitSpeechRecognition" in window)) {
        showToast("Speech recognition not supported in this browser.");
        return;
      }
      
      recognition = new webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      
      let finalTranscript = "";
      recognition.onresult = (event) => {
        let interimTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
        // Update the text input with recognized text
        textInput.value = finalTranscript + " " + interimTranscript;
      };
      
      recognition.onend = () => {
        if (isRecording) {
          // Restart if recording is still active
          recognition.start();
        }
      };
      
      recognition.start();
      
    } catch (error) {
      console.error("Error starting recording:", error);
      showToast("Could not access microphone. Please check permissions.");
      isRecording = false;
      recordButtonText.textContent = "Record";
      recordButton.classList.remove("recording");
      recordIndicator.style.display = "none";
    }
  }
  
  // Function to stop recording
  function stopRecording() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      
      // Stop all tracks in the stream
      if (mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
      
      // Stop speech recognition
      if (recognition) {
        recognition.stop();
      }
      
      // Update UI
      isRecording = false;
      recordButtonText.textContent = "Record";
      recordButton.classList.remove("recording");
      recordIndicator.style.display = "none";
    }
  }
  
  // Function to add item to knowledge base
  function addToKnowledgeBase() {
    const text = textInput.value.trim();
    if (!text) {
      showToast("Please enter some information.");
      return;
    }
    
    // Get existing knowledge items
    let knowledgeItems = JSON.parse(localStorage.getItem('deiKnowledgeBase') || '[]');
    
    // Add new item
    const newItem = {
      id: Date.now(), // Use timestamp as ID
      text: text,
      timestamp: new Date().toISOString()
    };
    
    knowledgeItems.push(newItem);
    
    // Save back to localStorage
    localStorage.setItem('deiKnowledgeBase', JSON.stringify(knowledgeItems));
    
    // Notify other tabs about the change
    try {
      chrome.runtime.sendMessage({
        action: 'knowledgeBaseUpdated',
        knowledgeItems: knowledgeItems
      });
    } catch (error) {
      console.error("Error notifying about knowledge base update:", error);
    }
    
    // Clear input and update display
    textInput.value = '';
    displayKnowledgeItems();
    
    showToast("Information added to knowledge base.");
  }
  
  // Function to display knowledge items
  function displayKnowledgeItems() {
    // Get items from localStorage
    const knowledgeItems = JSON.parse(localStorage.getItem('deiKnowledgeBase') || '[]');
    console.log("Knowledge items are here: ", knowledgeItems);
    
    // Clear container
    knowledgeContainer.innerHTML = '';
    
    // Show empty state or items
    if (knowledgeItems.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.textContent = 'No items in your knowledge base yet. Add information below.';
      knowledgeContainer.appendChild(emptyState);
      return;
    }
    
    // Add each item
    knowledgeItems.forEach(item => {
      const itemElement = document.createElement('div');
      itemElement.className = 'knowledge-item';
      
      // Create delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.innerHTML = '&times;';
      deleteBtn.addEventListener('click', () => deleteKnowledgeItem(item.id));
      
      // Create content
      const content = document.createElement('div');
      content.className = 'knowledge-content';
      content.textContent = item.text;
      
      // Create timestamp
      const timestamp = document.createElement('div');
      timestamp.className = 'knowledge-timestamp';
      const date = new Date(item.timestamp);
      timestamp.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
      
      // Build item
      itemElement.appendChild(deleteBtn);
      itemElement.appendChild(content);
      itemElement.appendChild(timestamp);
      
      knowledgeContainer.appendChild(itemElement);
    });
  }
  
  // Function to delete a knowledge item
  function deleteKnowledgeItem(id) {
    // Get existing knowledge items
    let knowledgeItems = JSON.parse(localStorage.getItem('deiKnowledgeBase') || '[]');
    
    // Filter out the item to delete
    knowledgeItems = knowledgeItems.filter(item => item.id !== id);
    
    // Save back to localStorage
    localStorage.setItem('deiKnowledgeBase', JSON.stringify(knowledgeItems));
    
    // Notify other tabs about the change
    try {
      chrome.runtime.sendMessage({
        action: 'knowledgeBaseUpdated',
        knowledgeItems: knowledgeItems
      });
    } catch (error) {
      console.error("Error notifying about knowledge base update:", error);
    }
    
    // Update display
    displayKnowledgeItems();
    
    showToast("Item deleted from knowledge base.");
  }
  
  // Function to clear all knowledge items
  function clearAllKnowledgeItems() {
    if (confirm('Are you sure you want to clear all items from your knowledge base?')) {
      // Clear from localStorage
      localStorage.setItem('deiKnowledgeBase', '[]');
      
      // Notify other tabs about the change
      try {
        chrome.runtime.sendMessage({
          action: 'knowledgeBaseUpdated',
          knowledgeItems: []
        });
      } catch (error) {
        console.error("Error notifying about knowledge base update:", error);
      }
      
      // Update display
      displayKnowledgeItems();
      
      showToast("All items cleared from knowledge base.");
    }
  }
  
  // Function to show toast message
  function showToast(message, duration = 3000) {
    toast.textContent = message;
    toast.style.opacity = '1';
    
    setTimeout(() => {
      toast.style.opacity = '0';
    }, duration);
  }
}); 