// Debug log to confirm content script is loaded
console.log("DEI Voice Assistant content script loaded!");

// Function to check if we're in a Chrome extension context
function isExtensionContext() {
  return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
}

// Log extension context
console.log("Running in extension context:", isExtensionContext());

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received in content script:", request);
  
  // No longer handling summarize actions here - just respond for ping/test purposes
  sendResponse({ status: "received", message: "Content script received message" });
  
  // Return false as we don't need async response
  return false;
});

// For testing purposes only
try {
  const testIndicator = document.createElement('div');
  testIndicator.style.cssText = `
    position: fixed;
    bottom: 5px;
    left: 5px;
    padding: 3px 6px;
    background-color: rgba(66, 133, 244, 0.2);
    color: #4285f4;
    border-radius: 3px;
    font-size: 10px;
    z-index: 9999;
    font-family: Arial, sans-serif;
  `;
  testIndicator.textContent = 'DEI Extension Active';
  document.body.appendChild(testIndicator);
} catch (error) {
  console.error("Error adding test indicator:", error);
}
