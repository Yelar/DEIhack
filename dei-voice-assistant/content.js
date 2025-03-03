// Debug log to confirm content script is loaded
console.log('DEI Voice Assistant content script loaded');
// Updated: Moved Read Aloud button to modal footer for better UX

const DEBUG = true;  // Enable debugging

// Variables for recording functionality
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let recognition;
let transcriptContent = '';
let transcriptModal;
let backendUrl = "http://127.0.0.1:5001/transcript"; // Same as in popup.js

// Track if the extension has been initialized
let isExtensionInitialized = false;

// Add CSS variables for theming
const DEI_THEME = {
  dark: {
    background: '#09090B',
    foreground: '#ffffff',
    card: '#1C1C1F',
    border: '#27272A',
    primary: '#8A2BE2', // Vibrant purple as primary
    secondary: '#3A3A40',
    accent: '#0EA5E9',
    muted: '#52525B',
    radius: '0.5rem',
    fontPrimary: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  }
};

console.log("DEI Voice Assistant content script loaded!");

// Function to log debug messages
function debugLog(...args) {
  if (DEBUG) {
    console.log("[DEI Extension]", ...args);
  }
}

// Function to check if we're in a Chrome extension context
function isExtensionContext() {
  return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
}

// Log extension context
debugLog("Running in extension context:", isExtensionContext());

// Create UI components for the explanation feature
function createExplainButton() {
  debugLog("Creating expandable action button and modal");
  
  // Add CSS for the expandable menu
  const menuStyle = document.createElement('style');
  menuStyle.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.8); }
      to { opacity: 1; transform: scale(1); }
    }
    
    @keyframes rotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(45deg); }
    }
    
    @keyframes rotateBack {
      from { transform: rotate(45deg); }
      to { transform: rotate(0deg); }
    }
    
    .dei-action-button {
      position: fixed;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background-color: ${DEI_THEME.dark.primary};
      color: ${DEI_THEME.dark.foreground};
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(138, 43, 226, 0.25);
      z-index: 9999;
      font-family: ${DEI_THEME.dark.fontPrimary};
      font-size: 24px;
      font-weight: 600;
      transition: all 0.2s ease;
      user-select: none;
    }
    
    .dei-action-button:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 20px rgba(138, 43, 226, 0.35);
    }
    
    .dei-menu-active {
      transform: rotate(45deg);
      background-color: ${DEI_THEME.dark.secondary};
    }
    
    .dei-menu-option {
      position: fixed;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background-color: ${DEI_THEME.dark.card};
      color: ${DEI_THEME.dark.foreground};
      border: 1px solid ${DEI_THEME.dark.border};
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      z-index: 9998;
      font-size: 18px;
      opacity: 0;
      pointer-events: none;
      transition: all 0.2s ease;
    }
    
    .dei-menu-option-visible {
      opacity: 1;
      pointer-events: auto;
    }
    
    .dei-tooltip {
      position: fixed;
      background-color: ${DEI_THEME.dark.card};
      color: ${DEI_THEME.dark.foreground};
      padding: 6px 12px;
      border-radius: ${DEI_THEME.dark.radius};
      font-size: 12px;
      font-family: ${DEI_THEME.dark.fontPrimary};
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      border: 1px solid ${DEI_THEME.dark.border};
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease;
      z-index: 10001;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(menuStyle);
  
  // Create floating action button container for dragging
  const actionButtonContainer = document.createElement('div');
  actionButtonContainer.id = 'dei-action-button-container';
  actionButtonContainer.style.cssText = `
    position: fixed;
    bottom: 40px;
    right: 20px;
    width: 60px;
    height: 60px;
    z-index: 9999;
  `;
  
  // Create the floating action button
  const actionButton = document.createElement('div');
  actionButton.id = 'dei-action-button';
  actionButton.className = 'dei-action-button';
  actionButton.innerHTML = '+';
  actionButtonContainer.appendChild(actionButton);
  
  // Create tooltip for the main button
  const mainTooltip = document.createElement('div');
  mainTooltip.id = 'dei-main-tooltip';
  mainTooltip.className = 'dei-tooltip';
  mainTooltip.textContent = 'DEI Assistant';
  document.body.appendChild(mainTooltip);
  
  // Create the menu options
  const optionButtons = [
    {
      id: 'dei-explain-option',
      icon: '🔍',
      tooltip: 'Explain Selection',
      action: activateExplainMode
    },
    {
      id: 'dei-summarize-option',
      icon: '📝',
      tooltip: 'Summarize Page',
      action: activateSummarizeMode
    },
    {
      id: 'dei-talk-option',
      icon: '🎙️',
      tooltip: 'Voice Assistant',
      action: activateTalkMode
    },
    {
      id: 'dei-knowledge-option',
      icon: '📚',
      tooltip: 'Knowledge Base',
      action: activateKnowledgeMode
    },
    {
      id: 'dei-form-option',
      icon: '📋',
      tooltip: 'Auto Form Fill',
      action: activateFormFillMode
    }
  ];
  
  // Create option buttons
  const optionElements = optionButtons.map((option, index) => {
    const optionButton = document.createElement('div');
    optionButton.id = option.id;
    optionButton.className = 'dei-menu-option';
    optionButton.innerHTML = option.icon;
    document.body.appendChild(optionButton);
    
    // Create tooltip for this option
    const tooltip = document.createElement('div');
    tooltip.id = `${option.id}-tooltip`;
    tooltip.className = 'dei-tooltip';
    tooltip.textContent = option.tooltip;
    document.body.appendChild(tooltip);
    
    // Add hover events for tooltip
    optionButton.addEventListener('mouseover', () => {
      const rect = optionButton.getBoundingClientRect();
      tooltip.style.top = rect.top + 'px';
      tooltip.style.left = (rect.right + 10) + 'px';
      tooltip.style.opacity = '1';
    });
    
    optionButton.addEventListener('mouseout', () => {
      tooltip.style.opacity = '0';
    });
    
    // Add click event
    optionButton.addEventListener('click', option.action);
    
    return { button: optionButton, tooltip };
  });
  
  // Make the button draggable
  let isDragging = false;
  let offsetX, offsetY;
  
  actionButtonContainer.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only left mouse button
    isDragging = true;
    
    const rect = actionButtonContainer.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    
    // Set the container to be movable
    actionButtonContainer.style.cursor = 'grabbing';
    
    // Prevent default to avoid text selection during drag
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    // Update position
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    
    // Keep within viewport bounds
    const maxX = window.innerWidth - actionButtonContainer.offsetWidth;
    const maxY = window.innerHeight - actionButtonContainer.offsetHeight;
    
    actionButtonContainer.style.left = Math.max(0, Math.min(maxX, x)) + 'px';
    actionButtonContainer.style.top = Math.max(0, Math.min(maxY, y)) + 'px';
    actionButtonContainer.style.right = 'auto';
    actionButtonContainer.style.bottom = 'auto';
    
    // Update option positions
    updateOptionPositions();
  });
  
  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    actionButtonContainer.style.cursor = 'grab';
  });
  
  // Add hover events for the main button tooltip
  actionButton.addEventListener('mouseover', () => {
    if (actionButton.classList.contains('dei-menu-active')) return;
    
    const rect = actionButton.getBoundingClientRect();
    mainTooltip.style.top = rect.top + 'px';
    mainTooltip.style.left = (rect.right + 10) + 'px';
    mainTooltip.style.opacity = '1';
  });
  
  actionButton.addEventListener('mouseout', () => {
    mainTooltip.style.opacity = '0';
  });
  
  // Handle click on main action button (expand/collapse menu)
  let isMenuOpen = false;
  
  actionButton.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent document click from immediately closing the menu
    toggleMenu();
  });
  
  // Close menu when clicking outside
  document.addEventListener('click', () => {
    if (isMenuOpen) {
      toggleMenu();
    }
  });
  
  // Function to toggle menu open/close
  function toggleMenu() {
    isMenuOpen = !isMenuOpen;
    
    if (isMenuOpen) {
      // Open menu
      actionButton.classList.add('dei-menu-active');
      mainTooltip.style.opacity = '0';
      
      // Show option buttons in a circular pattern
      updateOptionPositions();
      
      optionElements.forEach(({button}, index) => {
        button.classList.add('dei-menu-option-visible');
      });
    } else {
      // Close menu
      actionButton.classList.remove('dei-menu-active');
      
      // Hide option buttons
      optionElements.forEach(({button, tooltip}) => {
        button.classList.remove('dei-menu-option-visible');
        tooltip.style.opacity = '0';
      });
    }
  }
  
  // Function to update option positions in a semicircle above the main button
  function updateOptionPositions() {
    const rect = actionButtonContainer.getBoundingClientRect();
    const centerX = rect.left;
    const centerY = rect.top + rect.height/2;
    const spacing = 70; // Distance between buttons
    
    optionElements.forEach(({button, tooltip}, index) => {
      // Position buttons to the left of the main button in a horizontal row
      const xOffset = spacing * (index + 1); // Position based on index
      
      const x = centerX - xOffset;
      const y = centerY - button.offsetHeight/2;
      
      button.style.left = x + 'px';
      button.style.top = y + 'px';
      
      // Add a staggered animation delay for a sequential appearance
      button.style.transitionDelay = `${index * 0.05}s`;
    });
  }
  
  function activateExplainMode() {
    toggleMenu(); // Close the menu
    
    // Show instructions toast
    showToast('Select an area of the screen to explain');
    
    // Set up listeners for screenshot selection
    document.addEventListener('mousedown', startScreenshotSelection);
  }
  
  function activateSummarizeMode() {
    debugLog("Summarize mode activated");
    
    // Close the menu first
    toggleMenu();
    
    // Show instructions toast
    showToast('Analyzing page content for summarization...');
    
    // Show the scanning animation and then process the page
    showPageScanAnimation(() => {
      // Extract the page content
      const pageContent = extractPageContent();
      
      // Show processing toast
      showToast('Generating summary. This may take a moment...');
      
      // Send the page content to be summarized
      summarizePageContent(pageContent)
        .then(summary => {
          // Create a modal to display the summary
          const modalId = 'deiSummaryModal';
          let modal = document.getElementById(modalId);
          
          // If modal doesn't exist, create it
          if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'dei-modal';
            modal.innerHTML = `
              <div class="dei-modal-content">
                <div class="dei-modal-header">
                  <h2>Page Summary</h2>
                  <span class="dei-close-button">&times;</span>
                </div>
                <div class="dei-modal-body">
                  <div id="summaryContent" class="dei-summary-content"></div>
                </div>
                <div class="dei-modal-footer">
                  <button id="copySummaryBtn" class="dei-button">Copy to Clipboard</button>
                  <button id="readSummaryBtn" class="dei-button">Read Aloud</button>
                </div>
              </div>
            `;
            document.body.appendChild(modal);
            
            // Add event listeners for modal buttons
            modal.querySelector('.dei-close-button').addEventListener('click', () => {
              modal.style.display = 'none';
            });
            
            // Copy to clipboard functionality
            modal.querySelector('#copySummaryBtn').addEventListener('click', () => {
              const summaryText = modal.querySelector('#summaryContent').textContent;
              navigator.clipboard.writeText(summaryText)
                .then(() => {
                  showToast('Summary copied to clipboard', 2000);
                })
                .catch(err => {
                  console.error('Could not copy text: ', err);
                  showToast('Failed to copy to clipboard', 2000);
                });
            });
            
            // Read aloud functionality
            modal.querySelector('#readSummaryBtn').addEventListener('click', () => {
              const summaryText = modal.querySelector('#summaryContent').textContent;
              handleReadAloud(summaryText);
            });
            
            // Close modal when clicking outside
            window.addEventListener('click', (event) => {
              if (event.target === modal) {
                modal.style.display = 'none';
              }
            });
            
            // Escape key to close modal
            document.addEventListener('keydown', (event) => {
              if (event.key === 'Escape' && modal.style.display === 'block') {
                modal.style.display = 'none';
              }
            });
          }
          
          // Update the summary content
          const summaryContent = modal.querySelector('#summaryContent');
          
          // Format the summary with markdown-like styling
          let formattedSummary = summary;
          
          // Simple markdown parser for basic formatting
          formattedSummary = formattedSummary
            // Bold text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Italic text
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // Headers
            .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
            .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
            .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
            // Bullet points
            .replace(/^- (.*?)$/gm, '<li>$1</li>')
            // Numbered lists
            .replace(/^\d+\. (.*?)$/gm, '<li>$1</li>')
            // Convert line breaks to paragraphs
            .split('\n\n').map(para => `<p>${para}</p>`).join('');
          
          // Apply the formatted summary
          summaryContent.innerHTML = formattedSummary;
          
          // Display the modal
          modal.style.display = 'block';
          
          // Show success toast
          showToast('Summary generated successfully', 2000);
        })
        .catch(error => {
          console.error('Error generating summary:', error);
          showToast('Error generating summary: ' + error.message, 3000);
        });
    });
  }
  
  function activateTalkMode() {
    debugLog("Talk mode activated");
    
    // Close the menu
    toggleMenu();
    
    // Create transcript modal if it doesn't exist
    if (!transcriptModal) {
      createTranscriptModal();
    }
    
    // Toggle the transcript modal
    toggleTranscriptModal();
  }
  
  function activateKnowledgeMode() {
    debugLog("Knowledge base mode activated");
    
    // Close the menu
    toggleMenu();
    
    // Open knowledge base directly
    openKnowledgeBase();
  }
  
  function activateFormFillMode() {
    debugLog("Form fill mode activated");
    
    // Close the main menu
    toggleMenu();
    
    // Show form filling toast
    showToast('Analyzing form elements...', 3000);
    
    // Parse the page to find form elements
    const formElements = parseFormElements();
    
    if (formElements.length === 0) {
      showToast('No form elements found on this page', 3000);
      return;
    }
    
    // Show processing toast
    showToast(`Found ${formElements.length} form elements. Processing...`, 3000);
    
    // Send form elements to backend
    sendFormDataToBackend(formElements);
  }
  
  function showPageScanAnimation(callback) {
    // Create overlay element for the animation
    const overlay = document.createElement('div');
    overlay.className = 'dei-page-scan-overlay';
    document.body.appendChild(overlay);
    
    // Create highlight scanning element
    const highlight = document.createElement('div');
    highlight.className = 'dei-page-scan-highlight';
    document.body.appendChild(highlight);
    
    // Create central icon
    const icon = document.createElement('div');
    icon.className = 'dei-summarize-icon';
    icon.textContent = '📝';
    document.body.appendChild(icon);
    
    // Show toast notification
    showToast('Scanning page content...');
    
    // Remove elements after animation completes
    setTimeout(() => {
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
      if (document.body.contains(highlight)) document.body.removeChild(highlight);
      if (document.body.contains(icon)) document.body.removeChild(icon);
      
      // Execute callback after animation
      if (callback) callback();
    }, 2000);
  }
  
  function extractPageContent() {
    // Get main text content from the page
    let content = '';
    
    // Try to get content from article tags first
    const articles = document.querySelectorAll('article');
    if (articles.length > 0) {
      for (const article of articles) {
        content += article.innerText + '\n\n';
      }
    } else {
      // Fall back to main content areas
      const mainSelectors = ['main', '#content', '#main', '.content', '.main', '.article', '.post'];
      
      for (const selector of mainSelectors) {
        const mainElements = document.querySelectorAll(selector);
        if (mainElements.length > 0) {
          for (const element of mainElements) {
            content += element.innerText + '\n\n';
          }
          break;
        }
      }
      
      // If still no content, get the body text but try to exclude navigation, headers, footers
      if (!content.trim()) {
        // Exclude common navigation, header, footer elements
        const excludeSelectors = ['nav', 'header', 'footer', '.nav', '.header', '.footer', '#nav', '#header', '#footer'];
        const excludeElements = [];
        
        for (const selector of excludeSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            excludeElements.push(el);
          }
        }
        
        // Get all paragraphs that aren't in excluded elements
        const paragraphs = document.querySelectorAll('p');
        for (const p of paragraphs) {
          let shouldInclude = true;
          
          for (const excluded of excludeElements) {
            if (excluded.contains(p)) {
              shouldInclude = false;
              break;
            }
          }
          
          if (shouldInclude) {
            content += p.innerText + '\n\n';
          }
        }
        
        // If still no content, use the whole body as a last resort
        if (!content.trim()) {
          content = document.body.innerText;
        }
      }
    }
    
    // Get the page title
    const pageTitle = document.title;
    const url = window.location.href;
    
    // Add meta information
    const fullContent = `Title: ${pageTitle}\nURL: ${url}\n\n${content}`;
    
    return fullContent;
  }
  
  // Add the button to the document
  document.body.appendChild(actionButtonContainer);
  
  // Create modal for displaying explanations (keeping the existing modal code)
  const modalContainer = document.createElement('div');
  modalContainer.id = 'dei-explain-modal';
  modalContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    font-family: ${DEI_THEME.dark.fontPrimary};
    backdrop-filter: blur(4px);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  `;
  
  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background-color: ${DEI_THEME.dark.card};
    width: 85%;
    max-width: 600px;
    max-height: 85%;
    overflow-y: auto;
    border-radius: ${DEI_THEME.dark.radius};
    border: 1px solid ${DEI_THEME.dark.border};
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    padding: 24px;
    position: relative;
    color: ${DEI_THEME.dark.foreground};
    display: flex;
    flex-direction: column;
    gap: 16px;
    animation: modalFadeIn 0.3s ease-out;
  `;
  
  // Add keyframes for animation
  const modalStyleSheet = document.createElement("style");
  modalStyleSheet.textContent = `
    @keyframes modalFadeIn {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
    
    @keyframes pulse {
      0% { opacity: 0.6; }
      50% { opacity: 1; }
      100% { opacity: 0.6; }
    }
    
    #dei-explain-content a {
      color: ${DEI_THEME.dark.accent};
      text-decoration: none;
      border-bottom: 1px dashed ${DEI_THEME.dark.accent};
    }
    
    #dei-explain-content a:hover {
      opacity: 0.8;
    }
    
    #dei-audio-player {
      background-color: ${DEI_THEME.dark.secondary};
      border-radius: ${DEI_THEME.dark.radius};
      height: 40px;
    }
    
    #dei-read-aloud-btn {
      transition: all 0.2s ease;
    }
    
    #dei-read-aloud-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3);
    }
    
    #dei-modal-footer {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid ${DEI_THEME.dark.border};
      display: flex;
      justify-content: center;
    }
  `;
  document.head.appendChild(modalStyleSheet);
  
  const closeButton = document.createElement('button');
  closeButton.style.cssText = `
    position: absolute;
    top: 16px;
    right: 16px;
    background: ${DEI_THEME.dark.secondary};
    border: none;
    border-radius: 4px;
    width: 30px;
    height: 30px;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: ${DEI_THEME.dark.foreground};
    transition: all 0.2s ease;
    opacity: 0.8;
    z-index: 1;
  `;
  closeButton.innerHTML = '&times;';
  closeButton.addEventListener('mouseover', () => closeButton.style.opacity = '1');
  closeButton.addEventListener('mouseout', () => closeButton.style.opacity = '0.8');
  closeButton.addEventListener('click', () => {
    modalContainer.style.display = 'none';
    stopAudio(); // Stop any playing audio when closing the modal
  });
  
  const modalTitle = document.createElement('h3');
  modalTitle.textContent = 'Explanation';
  modalTitle.style.cssText = `
    margin: 0;
    color: ${DEI_THEME.dark.foreground};
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.02em;
    padding-bottom: 12px;
    border-bottom: 1px solid ${DEI_THEME.dark.border};
  `;
  
  const modalBody = document.createElement('div');
  modalBody.id = 'dei-explain-content';
  modalBody.style.cssText = `
    color: ${DEI_THEME.dark.foreground};
    opacity: 0.9;
    line-height: 1.6;
    font-size: 15px;
    max-height: 400px;
    overflow-y: auto;
    padding: 8px 4px;
    scrollbar-width: thin;
    scrollbar-color: ${DEI_THEME.dark.muted} transparent;
  `;
  
  const loadingIndicator = document.createElement('div');
  loadingIndicator.id = 'dei-explain-loading';
  loadingIndicator.style.cssText = `
    text-align: center;
    padding: 28px 20px;
    color: ${DEI_THEME.dark.foreground};
    opacity: 0.7;
    font-size: 15px;
    display: none;
    animation: pulse 1.5s infinite;
  `;
  loadingIndicator.textContent = 'Getting explanation...';
  
  // Create modal footer for the Read Aloud button
  const modalFooter = document.createElement('div');
  modalFooter.id = 'dei-modal-footer';
  
  // Create Read Aloud button in the footer
  const readAloudBtn = document.createElement('button');
  readAloudBtn.id = 'dei-read-aloud-btn';
  readAloudBtn.style.cssText = `
    background-color: ${DEI_THEME.dark.accent};
    color: white;
    border: none;
    border-radius: ${DEI_THEME.dark.radius};
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: none;
  `;
  readAloudBtn.innerHTML = '<span style="font-size: 16px;">🔊</span> Read Aloud';
  readAloudBtn.addEventListener('click', handleReadAloud);
  
  // Add hover effects
  readAloudBtn.addEventListener('mouseover', () => {
    readAloudBtn.style.transform = 'translateY(-2px)';
    readAloudBtn.style.boxShadow = '0 4px 12px rgba(14, 165, 233, 0.3)';
  });
  readAloudBtn.addEventListener('mouseout', () => {
    readAloudBtn.style.transform = 'translateY(0)';
    readAloudBtn.style.boxShadow = '0 2px 8px rgba(14, 165, 233, 0.25)';
  });
  
  modalFooter.appendChild(readAloudBtn);
  
  // Create audio player section
  const audioSection = document.createElement('div');
  audioSection.id = 'dei-audio-section';
  audioSection.style.cssText = `
    margin-top: 8px;
    padding-top: 16px;
    border-top: 1px solid ${DEI_THEME.dark.border};
    display: flex;
    flex-direction: column;
    gap: 12px;
    display: none;
  `;
  
  // Create audio player
  const audioPlayer = document.createElement('audio');
  audioPlayer.id = 'dei-audio-player';
  audioPlayer.controls = true;
  audioPlayer.style.cssText = `
    width: 100%;
    margin-top: 8px;
    display: none;
    border-radius: ${DEI_THEME.dark.radius};
  `;
  
  // Build the modal
  modalContent.appendChild(closeButton);
  modalContent.appendChild(modalTitle);
  modalContent.appendChild(loadingIndicator);
  modalContent.appendChild(modalBody);
  modalContent.appendChild(modalFooter);
  
  // Add the audio player to the audio section
  audioSection.appendChild(audioPlayer);
  
  modalContent.appendChild(audioSection); // Add audio section
  modalContainer.appendChild(modalContent);
  
  document.body.appendChild(modalContainer);
  
  debugLog("Expandable action button and modal created with dark theme");
}

// Function to handle the Read Aloud button click
function handleReadAloud() {
  debugLog("Read Aloud button clicked");
  
  // Get the explanation text
  const content = document.getElementById('dei-explain-content');
  if (!content || !content.textContent.trim()) {
    showToast('No explanation available to read');
    return;
  }
  
  // Get UI elements
  const audioPlayer = document.getElementById('dei-audio-player');
  const readAloudBtn = document.getElementById('dei-read-aloud-btn');
  const audioSection = document.getElementById('dei-audio-section');
  
  if (readAloudBtn) {
    readAloudBtn.disabled = true;
    readAloudBtn.textContent = 'Generating audio...';
  }
  
  // Clean up the text (remove HTML tags)
  const textToRead = content.textContent.trim();
  
  showToast('Generating audio...');
  
  // Call the text_to_speech endpoint
  fetch('http://127.0.0.1:5001/text_to_speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: textToRead,
      voice: 'alloy' // Use a neutral voice
    })
  })
  .then(response => {
    debugLog("Got response from text_to_speech:", response.status);
    if (!response.ok) {
      throw new Error('Failed to generate audio');
    }
    return response.blob();
  })
  .then(audioBlob => {
    debugLog("Received audio blob, size:", audioBlob.size);
    
    // Create a URL for the audio blob
    const audioUrl = URL.createObjectURL(audioBlob);
    
    // Show the audio section
    if (audioSection) {
      audioSection.style.display = 'flex';
    }
    
    // Update the audio player
    if (audioPlayer) {
      audioPlayer.src = audioUrl;
      audioPlayer.style.display = 'block';
      audioPlayer.play();
    }
    
    // Update button
    if (readAloudBtn) {
      readAloudBtn.disabled = false;
      readAloudBtn.innerHTML = '<span style="font-size: 16px;">🔊</span> Read Aloud';
    }
    
    showToast('Playing audio explanation');
  })
  .catch(error => {
    debugLog("Error getting audio:", error);
    if (readAloudBtn) {
      readAloudBtn.disabled = false;
      readAloudBtn.innerHTML = '<span style="font-size: 16px;">🔊</span> Read Aloud';
    }
    showToast('Failed to generate audio');
  });
}

// Function to stop audio playback
function stopAudio() {
  const audioPlayer = document.getElementById('dei-audio-player');
  
  if (audioPlayer) {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    audioPlayer.style.display = 'none';
  }
  
  // Also send a stop request to the backend to cancel any in-progress TTS
  fetch('http://127.0.0.1:5001/stop_audio', {
    method: 'POST'
  }).catch(error => {
    debugLog("Error stopping audio on server:", error);
  });
}

// Add context menu for explaining selected text
function setupContextMenu() {
  document.addEventListener('contextmenu', function(event) {
    const selection = window.getSelection().toString().trim();
    
    // Remove any existing context menu items
    const existingContextMenu = document.getElementById('dei-context-menu');
    if (existingContextMenu) {
      existingContextMenu.remove();
    }
    
    // Only show our context menu if text is selected
    if (selection) {
      event.preventDefault();
      
      // Create custom context menu
      const contextMenu = document.createElement('div');
      contextMenu.id = 'dei-context-menu';
      contextMenu.style.cssText = `
        position: fixed;
        z-index: 10000;
        background: ${DEI_THEME.dark.card};
        border: 1px solid ${DEI_THEME.dark.border};
        border-radius: ${DEI_THEME.dark.radius};
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
        padding: 8px 0;
        min-width: 180px;
        backdrop-filter: blur(8px);
        animation: menuFadeIn 0.2s ease-out forwards;
      `;
      
      // Add animation for the context menu
      const menuStyle = document.createElement('style');
      menuStyle.textContent = `
        @keyframes menuFadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        
        #dei-context-menu > div:hover {
          background-color: ${DEI_THEME.dark.secondary};
        }
      `;
      document.head.appendChild(menuStyle);
      
      // Position the context menu
      contextMenu.style.left = event.pageX + 'px';
      contextMenu.style.top = event.pageY + 'px';
      
      // Add the "Explain This" option
      const explainOption = document.createElement('div');
      explainOption.style.cssText = `
        padding: 10px 14px;
        cursor: pointer;
        color: ${DEI_THEME.dark.foreground};
        font-family: ${DEI_THEME.dark.fontPrimary};
        font-size: 14px;
        display: flex;
        align-items: center;
        transition: background-color 0.15s ease;
        user-select: none;
      `;
      explainOption.innerHTML = '<span style="margin-right: 8px; font-size: 16px;">🔍</span> Explain This';
      explainOption.addEventListener('click', function() {
        explainSelectedText(selection);
        // Remove the menu style element
        if (document.head.contains(menuStyle)) {
          document.head.removeChild(menuStyle);
        }
      });
      
      contextMenu.appendChild(explainOption);
      document.body.appendChild(contextMenu);
      
      // Make sure context menu is within viewport
      const menuRect = contextMenu.getBoundingClientRect();
      if (menuRect.right > window.innerWidth) {
        contextMenu.style.left = (window.innerWidth - menuRect.width - 10) + 'px';
      }
      if (menuRect.bottom > window.innerHeight) {
        contextMenu.style.top = (window.innerHeight - menuRect.height - 10) + 'px';
      }
      
      // Store the style element reference on the menu
      contextMenu.menuStyle = menuStyle;
    }
  });
  
  document.addEventListener('click', function removeMenu() {
    const contextMenu = document.getElementById('dei-context-menu');
    if (contextMenu) {
      // Remove the style element if it exists
      if (contextMenu.menuStyle && document.head.contains(contextMenu.menuStyle)) {
        document.head.removeChild(contextMenu.menuStyle);
      }
      contextMenu.remove();
    }
  });
  
  document.addEventListener('keydown', function escKeyHandler(e) {
    if (e.key === 'Escape') {
      const contextMenu = document.getElementById('dei-context-menu');
      if (contextMenu) {
        // Remove the style element if it exists
        if (contextMenu.menuStyle && document.head.contains(contextMenu.menuStyle)) {
          document.head.removeChild(contextMenu.menuStyle);
        }
        contextMenu.remove();
      }
    }
  });
}

// Handle screenshot selection
let startX, startY;

function startScreenshotSelection(e) {
  debugLog("Starting screenshot selection");
  
  // Prevent selection on right click
  if (e.button === 2) {
    deactivateScreenshotMode();
    return;
  }
  
  // Remove any existing selection elements first
  const existingOverlay = document.getElementById('dei-selection-overlay');
  if (existingOverlay) existingOverlay.remove();
  
  const existingBox = document.getElementById('dei-selection-box');
  if (existingBox) existingBox.remove();
  
  // Create the selection overlay
  const overlay = document.createElement('div');
  overlay.id = 'dei-selection-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(9, 9, 11, 0.3);
    z-index: 9998;
    cursor: crosshair;
    backdrop-filter: blur(2px);
    transition: background-color 0.2s ease;
  `;
  document.body.appendChild(overlay);
  
  // Add instructions
  const instructions = document.createElement('div');
  instructions.id = 'dei-screenshot-instructions';
  instructions.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: ${DEI_THEME.dark.card};
    color: ${DEI_THEME.dark.foreground};
    padding: 10px 16px;
    border-radius: ${DEI_THEME.dark.radius};
    font-family: ${DEI_THEME.dark.fontPrimary};
    font-size: 14px;
    z-index: 10000;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    border: 1px solid ${DEI_THEME.dark.border};
    text-align: center;
    animation: fadeIn 0.3s ease;
  `;
  instructions.innerHTML = 'Select an area to explain <span style="opacity: 0.7; margin-left: 5px;">(ESC to cancel)</span>';
  document.body.appendChild(instructions);
  
  // Store the start position
  startX = e.clientX;
  startY = e.clientY;
  
  // Create the selection box
  const selectionBox = document.createElement('div');
  selectionBox.id = 'dei-selection-box';
  selectionBox.style.cssText = `
    position: fixed;
    border: 2px solid ${DEI_THEME.dark.primary};
    background-color: rgba(138, 43, 226, 0.15);
    z-index: 9999;
    left: ${startX}px;
    top: ${startY}px;
    width: 0;
    height: 0;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1);
  `;
  document.body.appendChild(selectionBox);
  
  // Set up event listeners for mousemove and mouseup
  document.addEventListener('mousemove', updateScreenshotSelection);
  document.addEventListener('mouseup', finishScreenshotSelection);
  
  // Add escape key handler to cancel
  document.addEventListener('keydown', function escKeyHandler(e) {
    if (e.key === 'Escape') {
      deactivateScreenshotMode();
      document.removeEventListener('keydown', escKeyHandler);
    }
  });
}

function updateScreenshotSelection(e) {
  const selectionBox = document.getElementById('dei-selection-box');
  if (!selectionBox) return;
  
  // Calculate the new width and height
  const width = Math.abs(e.clientX - startX);
  const height = Math.abs(e.clientY - startY);
  
  // Calculate the new left and top (in case of negative selection)
  const left = e.clientX > startX ? startX : e.clientX;
  const top = e.clientY > startY ? startY : e.clientY;
  
  // Update the selection box
  selectionBox.style.width = width + 'px';
  selectionBox.style.height = height + 'px';
  selectionBox.style.left = left + 'px';
  selectionBox.style.top = top + 'px';
}

function finishScreenshotSelection(e) {
  // Remove the event listeners
  document.removeEventListener('mousemove', updateScreenshotSelection);
  document.removeEventListener('mouseup', finishScreenshotSelection);
  
  // Get the selection box
  const selectionBox = document.getElementById('dei-selection-box');
  if (!selectionBox) return;
  
  // Get the selection coordinates
  const selection = {
    left: parseInt(selectionBox.style.left),
    top: parseInt(selectionBox.style.top),
    width: parseInt(selectionBox.style.width),
    height: parseInt(selectionBox.style.height)
  };
  
  // Capture the screenshot if the selection is large enough
  if (selection.width > 10 && selection.height > 10) {
    captureScreenshot(selection);
  } else {
    // Remove the overlay and selection box if the selection is too small
    deactivateScreenshotMode();
    showToast('Selection too small, please try again');
  }
}

function captureScreenshot(selection) {
  debugLog("Capturing screenshot with selection:", selection);
  
  // Deactivate screenshot mode first to clean up UI
  deactivateScreenshotMode();
  
  // Show that we're capturing
  showToast('Capturing screenshot...');
  
  // Use chrome.tabs.captureVisibleTab to get the full tab screenshot
  debugLog("Sending captureScreenshot message to background script");
  chrome.runtime.sendMessage({
    action: 'captureScreenshot',
    selection: selection
  }, function(response) {
    if (chrome.runtime.lastError) {
      debugLog("Error from sendMessage:", chrome.runtime.lastError);
      showToast('Failed to capture screenshot: ' + chrome.runtime.lastError.message);
      return;
    }
    
    debugLog("Got response from background script:", response ? "Response received" : "No response");
    
    if (response && response.fullScreenshot) {
      debugLog("Full screenshot received, cropping in content script");
      
      try {
        // Now crop the image in the content script where we can use DOM APIs
        cropScreenshot(response.fullScreenshot, selection);
      } catch (error) {
        debugLog("Error processing screenshot:", error);
        showToast('Error processing screenshot: ' + error.message);
      }
    } else if (response && response.error) {
      debugLog("Error capturing screenshot:", response.error);
      showToast('Failed to capture screenshot: ' + response.error);
    } else {
      debugLog("No image data in response");
      showToast('Failed to capture screenshot');
    }
  });
}

// New function to crop screenshots in the content script
function cropScreenshot(fullImageDataUrl, selection) {
  const img = new Image();
  
  img.onload = function() {
    debugLog("Screenshot loaded for cropping, dimensions:", img.width, "x", img.height);
    
    try {
      // Create a canvas to crop the image
      const canvas = document.createElement('canvas');
      
      // Get the device pixel ratio for high-DPI screens
      const devicePixelRatio = window.devicePixelRatio || 1;
      debugLog("Device pixel ratio:", devicePixelRatio);
      
      // Set canvas dimensions to selection size
      canvas.width = selection.width;
      canvas.height = selection.height;
      
      // Calculate the actual coordinates for cropping
      const cropX = selection.left * devicePixelRatio;
      const cropY = selection.top * devicePixelRatio;
      const cropWidth = selection.width * devicePixelRatio;
      const cropHeight = selection.height * devicePixelRatio;
      
      debugLog("Cropping image at:", cropX, cropY, cropWidth, cropHeight);
      
      // Draw the selected portion of the screenshot onto the canvas
      const ctx = canvas.getContext('2d');
      ctx.drawImage(
        img,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, selection.width, selection.height
      );
      
      // Convert the canvas to a data URL
      const croppedDataUrl = canvas.toDataURL('image/png');
      debugLog("Cropped image created, sending to explain endpoint");
      
      // Send the cropped image to the explain endpoint
      sendToExplainEndpoint({ image_data: croppedDataUrl });
    } catch (error) {
      debugLog("Error cropping image:", error);
      showToast('Error processing screenshot: ' + error.message);
    }
  };
  
  img.onerror = function() {
    debugLog("Error loading screenshot for cropping");
    showToast('Error processing screenshot');
  };
  
  img.src = fullImageDataUrl;
}

// Send selected text to the explain endpoint
function explainSelectedText(text) {
  showToast('Getting explanation...');
  sendToExplainEndpoint({ text: text });
}

// Send data to the backend explain endpoint
function sendToExplainEndpoint(data) {
  debugLog("Sending data to explain endpoint:", data);
  
  // Show loading indicator in the modal
  const modal = document.getElementById('dei-explain-modal');
  const loading = document.getElementById('dei-explain-loading');
  const content = document.getElementById('dei-explain-content');
  const readAloudBtn = document.getElementById('dei-read-aloud-btn');
  
  if (modal && loading && content) {
    content.innerHTML = '';
    loading.style.display = 'block';
    modal.style.display = 'flex';
    
    // Hide the Read Aloud button until content is loaded
    if (readAloudBtn) {
      readAloudBtn.style.display = 'none';
    }
  }
  
  // Ensure we have valid data to send
  if (!data.text && (!data.image_data || data.image_data === '')) {
    debugLog("Error: No valid data to send");
    
    if (loading) loading.style.display = 'none';
    if (content) content.innerHTML = '<p style="color: red;">Error: No valid data to send for explanation.</p>';
    
    showToast('Error: Nothing to explain');
    return;
  }
  
  function performFetch(data) {
    // Log the request
    debugLog("Sending fetch request to http://127.0.0.1:5001/explain");
    
    // Send to backend
    fetch('http://127.0.0.1:5001/explain', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
    .then(response => {
      debugLog("Got response:", response.status);
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.status}`);
      }
      return response.json();
    })
    .then(responseData => {
      debugLog("Got data:", responseData);
      
      // Hide loading indicator and show explanation
      if (loading) loading.style.display = 'none';
      
      if (content && responseData.explanation) {
        // Format explanation HTML
        const formattedExplanation = responseData.explanation.replace(/\n/g, '<br>');
        
        // Set the content with explanation only (no button needed now)
        content.innerHTML = formattedExplanation;
        
        // Show the Read Aloud button in the footer
        const readAloudBtn = document.getElementById('dei-read-aloud-btn');
        if (readAloudBtn) {
          debugLog("Read Aloud button made visible");
          readAloudBtn.style.display = 'inline-flex';
        } else {
          debugLog("ERROR: Read Aloud button wasn't found");
        }
        
        // Reset audio player
        const audioPlayer = document.getElementById('dei-audio-player');
        if (audioPlayer) {
          audioPlayer.style.display = 'none';
          audioPlayer.src = '';
        }
        
        // Hide audio section
        const audioSection = document.getElementById('dei-audio-section');
        if (audioSection) {
          audioSection.style.display = 'none';
        }
      } else {
        debugLog("No explanation in response");
        showToast('Error: No explanation received');
      }
    })
    .catch(error => {
      debugLog("Error getting explanation:", error);
      
      // Hide loading and show error
      if (loading) loading.style.display = 'none';
      if (content) content.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
      
      showToast('Failed to get explanation');
    });
  }
  
  // Check if image data is too large and needs to be compressed
  if (data.image_data && data.image_data.length > 10000000) { // 10MB limit
    debugLog("Image data too large, compressing...");
    compressImageData(data.image_data)
      .then(compressedData => {
        data.image_data = compressedData;
        debugLog("Compressed image size:", compressedData.length);
        performFetch(data);
      })
      .catch(error => {
        debugLog("Error compressing image:", error);
        if (loading) loading.style.display = 'none';
        if (content) content.innerHTML = '<p style="color: red;">Error: Failed to compress image. Please try a smaller selection.</p>';
        showToast('Failed to process image');
      });
  } else {
    performFetch(data);
  }
}

// Helper function to compress image data
function compressImageData(imageDataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = function() {
      try {
        const canvas = document.createElement('canvas');
        
        // Calculate new dimensions (reduce to max 800px width or height)
        let width = img.width;
        let height = img.height;
        const maxDimension = 800;
        
        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Lower quality for smaller file size
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(compressedDataUrl);
      } catch (e) {
        reject(e);
      }
    };
    
    img.onerror = function() {
      reject(new Error('Failed to load image for compression'));
    };
    
    img.src = imageDataUrl;
  });
}

// Initialize the explain feature with more robust approach
function initExplainFeature() {
  debugLog("Initializing explain feature");
  
  // Skip if already initialized
  if (isExtensionInitialized) {
    debugLog("Extension already initialized, skipping initialization");
    return;
  }
  
  try {
    // Clean up any existing UI elements in case of re-initialization
    
    // Remove old explain button if it exists
    const existingButton = document.getElementById('dei-explain-button');
    if (existingButton) {
      existingButton.remove();
      debugLog("Removed existing explain button");
    }
    
    // Remove expandable action button and container if they exist
    const existingActionButton = document.getElementById('dei-action-button-container');
    if (existingActionButton) {
      existingActionButton.remove();
      debugLog("Removed existing action button container");
    }
    
    // Remove option buttons if they exist
    const optionIds = ['dei-explain-option', 'dei-summarize-option'];
    optionIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.remove();
        debugLog(`Removed existing option button: ${id}`);
      }
      
      // Also remove associated tooltips
      const tooltip = document.getElementById(`${id}-tooltip`);
      if (tooltip) {
        tooltip.remove();
        debugLog(`Removed existing tooltip: ${id}-tooltip`);
      }
    });
    
    // Remove main tooltip if it exists
    const mainTooltip = document.getElementById('dei-main-tooltip');
    if (mainTooltip) {
      mainTooltip.remove();
      debugLog("Removed existing main tooltip");
    }
    
    // Remove modal if it exists
    const existingModal = document.getElementById('dei-explain-modal');
    if (existingModal) {
      existingModal.remove();
      debugLog("Removed existing modal");
    }
    
    // Remove any leftover selection elements
    const selectionOverlay = document.getElementById('dei-selection-overlay');
    if (selectionOverlay) {
      selectionOverlay.remove();
      debugLog("Removed existing selection overlay");
    }
    
    const selectionBox = document.getElementById('dei-selection-box');
    if (selectionBox) {
      selectionBox.remove();
      debugLog("Removed existing selection box");
    }
    
    // Create the UI components
    createExplainButton();
    setupContextMenu();
    
    // Mark as initialized
    isExtensionInitialized = true;
    
    debugLog("Explain feature initialized successfully");
  } catch (error) {
    console.error("Error initializing explain feature:", error);
  }
}

// Main initialization - use only one reliable approach to avoid duplicate initialization
document.addEventListener('DOMContentLoaded', function() {
  debugLog("DOMContentLoaded fired");
  // Clear any existing initialization
  isExtensionInitialized = false;
  // Initialize the extension
  initExplainFeature();
});

// Listen for messages from the popup or background script
if (isExtensionContext() && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Message received in content script:", request);
    
    // No longer handling summarize actions here - just respond for ping/test purposes
    sendResponse({ status: "received", message: "Content script received message" });
    
    // Return false as we don't need async response
    return false;
  });
  debugLog("Set up chrome.runtime.onMessage listener");
}

// Fallback initialization for cases where DOMContentLoaded might have already fired
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  debugLog("Document already loaded, using fallback initialization");
  setTimeout(function() {
    // Only run if not already initialized by DOMContentLoaded
    if (!isExtensionInitialized) {
      debugLog("Using fallback initialization");
      initExplainFeature();
    }
  }, 500);
}

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

// Helper function to deactivate screenshot mode
function deactivateScreenshotMode() {
  debugLog("Deactivating screenshot mode");
  
  // Remove selection elements
  const overlay = document.getElementById('dei-selection-overlay');
  if (overlay) overlay.remove();
  
  const selectionBox = document.getElementById('dei-selection-box');
  if (selectionBox) selectionBox.remove();
  
  const instructions = document.getElementById('dei-screenshot-instructions');
  if (instructions) instructions.remove();
  
  // Remove event listeners
  document.removeEventListener('mousedown', startScreenshotSelection);
  document.removeEventListener('mousemove', updateScreenshotSelection);
  document.removeEventListener('mouseup', finishScreenshotSelection);
  
  // Reset variables
  isScreenshotMode = false;
  startX = null;
  startY = null;
  
  showToast('Screenshot mode deactivated');
}

// Create a toast notification
function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 110px;
    right: 20px;
    background-color: ${DEI_THEME.dark.card};
    color: ${DEI_THEME.dark.foreground};
    padding: 12px 18px;
    border-radius: ${DEI_THEME.dark.radius};
    font-family: ${DEI_THEME.dark.fontPrimary};
    font-size: 14px;
    font-weight: 500;
    z-index: 10000;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
    border: 1px solid ${DEI_THEME.dark.border};
    transform: translateY(0);
    opacity: 0;
    max-width: 300px;
    animation: toastFadeIn 0.3s forwards;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Add animation for the toast
  const toastStyle = document.createElement('style');
  toastStyle.textContent = `
    @keyframes toastFadeIn {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(toastStyle);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast);
      }
      if (document.head.contains(toastStyle)) {
        document.head.removeChild(toastStyle);
      }
    }, 300);
  }, duration);
}

// Function to summarize selected text
function summarizeSelectedText(text) {
  debugLog("Summarizing text:", text.substring(0, 100) + (text.length > 100 ? '...' : ''));
  
  // Show the modal with loading indicator
  const modal = document.getElementById('dei-explain-modal');
  const loading = document.getElementById('dei-explain-loading');
  const content = document.getElementById('dei-explain-content');
  const modalTitle = modal.querySelector('h3');
  const readAloudBtn = document.getElementById('dei-read-aloud-btn');
  
  if (modal && loading && content) {
    // Change the title to show we're summarizing
    if (modalTitle) modalTitle.textContent = 'Text Summary';
    
    content.innerHTML = '';
    loading.style.display = 'block';
    modal.style.display = 'flex';
    
    // Hide the Read Aloud button until content is loaded
    if (readAloudBtn) {
      readAloudBtn.style.display = 'none';
    }
    
    // Add animation to the loading indicator
    loading.textContent = 'Generating summary...';
    loading.style.animation = 'pulse 1.5s infinite';
  }
  
  // Send the text to the backend for summarization
  fetch('http://127.0.0.1:5001/summarize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: text
    })
  })
  .then(response => {
    debugLog("Got response from summarize endpoint:", response.status);
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.status}`);
    }
    return response.json();
  })
  .then(responseData => {
    debugLog("Got summarization data:", responseData);
    
    // Hide loading indicator
    if (loading) loading.style.display = 'none';
    
    if (content && responseData.summary) {
      // Format summary HTML
      const formattedSummary = responseData.summary.replace(/\n/g, '<br>');
      
      // Set the content with summary only (no button needed now)
      content.innerHTML = formattedSummary;
      
      // Show the Read Aloud button in the footer
      const readAloudBtn = document.getElementById('dei-read-aloud-btn');
      if (readAloudBtn) {
        debugLog("Read Aloud button made visible");
        readAloudBtn.style.display = 'inline-flex';
      }
      
      // Reset audio player
      const audioPlayer = document.getElementById('dei-audio-player');
      if (audioPlayer) {
        audioPlayer.style.display = 'none';
        audioPlayer.src = '';
      }
      
      // Hide audio section
      const audioSection = document.getElementById('dei-audio-section');
      if (audioSection) {
        audioSection.style.display = 'none';
      }
    } else {
      debugLog("No summary in response");
      if (content) content.innerHTML = '<p style="color: red;">Error: Failed to generate summary.</p>';
      showToast('Failed to generate summary');
    }
  })
  .catch(error => {
    debugLog("Error getting summary:", error);
    
    // Hide loading and show error
    if (loading) loading.style.display = 'none';
    if (content) content.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    
    showToast('Failed to get summary');
  });
}

// Add CSS animation for summarizing
const animationStyles = document.createElement('style');
animationStyles.textContent = `
  @keyframes pageScanOverlay {
    0% { opacity: 0; }
    20% { opacity: 0.3; }
    100% { opacity: 0; }
  }
  
  @keyframes pageScanHighlight {
    0% { width: 0; left: 0; opacity: 0.7; }
    50% { width: 100%; left: 0; opacity: 0.7; }
    100% { width: 0; left: 100%; opacity: 0.7; }
  }
  
  @keyframes summarizePulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); }
  }
  
  .dei-page-scan-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: ${DEI_THEME.dark.primary};
    z-index: 9997;
    pointer-events: none;
    animation: pageScanOverlay 2s ease-in-out;
  }
  
  .dei-page-scan-highlight {
    position: fixed;
    top: 0;
    left: 0;
    height: 100%;
    width: 0;
    background-color: rgba(255, 255, 255, 0.2);
    z-index: 9998;
    pointer-events: none;
    animation: pageScanHighlight 2s ease-in-out;
  }
  
  .dei-summarize-icon {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 40px;
    color: white;
    background-color: ${DEI_THEME.dark.accent};
    width: 80px;
    height: 80px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    box-shadow: 0 0 30px rgba(14, 165, 233, 0.5);
    animation: summarizePulse 1s infinite;
  }
`;
document.head.appendChild(animationStyles);

function summarizePageContent(content) {
  showToast('Summarizing page content...');
  
  // Show the modal with loading indicator
  const modal = document.getElementById('dei-explain-modal');
  const loading = document.getElementById('dei-explain-loading');
  const modalContent = document.getElementById('dei-explain-content');
  const modalTitle = modal.querySelector('h3');
  const readAloudBtn = document.getElementById('dei-read-aloud-btn');
  
  if (modal && loading && modalContent) {
    // Change the title to show we're summarizing
    if (modalTitle) modalTitle.textContent = 'Page Summary';
    
    modalContent.innerHTML = '';
    loading.style.display = 'block';
    modal.style.display = 'flex';
    
    // Hide the Read Aloud button until content is loaded
    if (readAloudBtn) {
      readAloudBtn.style.display = 'none';
    }
    
    // Add animation to the loading indicator
    loading.textContent = 'Generating page summary...';
    loading.style.animation = 'pulse 1.5s infinite';
  }
  
  // Send the content to the backend for summarization
  fetch('http://127.0.0.1:5001/summarize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: content
    })
  })
  .then(response => {
    debugLog("Got response from summarize endpoint:", response.status);
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.status}`);
    }
    return response.json();
  })
  .then(responseData => {
    debugLog("Got summarization data:", responseData);
    
    // Hide loading indicator
    if (loading) loading.style.display = 'none';
    
    if (modalContent && responseData.summary) {
      // Format summary HTML with a nice border and styling
      const formattedSummary = `
        <div style="
          border-left: 3px solid ${DEI_THEME.dark.accent};
          padding-left: 16px;
          margin: 16px 0;
          animation: fadeIn 0.5s ease-out;
        ">
          ${responseData.summary.replace(/\n/g, '<br>')}
        </div>
      `;
      
      // Set the content with summary only (no button needed now)
      modalContent.innerHTML = formattedSummary;
      
      // Show the Read Aloud button in the footer with animation
      const readAloudBtn = document.getElementById('dei-read-aloud-btn');
      if (readAloudBtn) {
        debugLog("Read Aloud button made visible");
        readAloudBtn.style.display = 'inline-flex';
        readAloudBtn.style.animation = 'fadeIn 0.5s ease-out 0.3s both';
      }
      
      // Reset audio player
      const audioPlayer = document.getElementById('dei-audio-player');
      if (audioPlayer) {
        audioPlayer.style.display = 'none';
        audioPlayer.src = '';
      }
      
      // Hide audio section
      const audioSection = document.getElementById('dei-audio-section');
      if (audioSection) {
        audioSection.style.display = 'none';
      }
    } else {
      debugLog("No summary in response");
      if (modalContent) modalContent.innerHTML = '<p style="color: red;">Error: Failed to generate summary.</p>';
      showToast('Failed to generate summary');
    }
  })
  .catch(error => {
    debugLog("Error getting summary:", error);
    
    // Hide loading and show error
    if (loading) loading.style.display = 'none';
    if (modalContent) modalContent.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    
    showToast('Failed to get summary');
  });
}

// Function to create a small draggable transcript modal
function createTranscriptModal() {
  debugLog("Creating transcript modal");
  
  // Create modal container
  transcriptModal = document.createElement('div');
  transcriptModal.id = 'dei-transcript-modal';
  transcriptModal.style.cssText = `
    position: fixed;
    background-color: ${DEI_THEME.dark.card};
    border-radius: ${DEI_THEME.dark.radius};
    border: 1px solid ${DEI_THEME.dark.border};
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    padding: 12px;
    z-index: 9997;
    width: 300px;
    display: none;
    flex-direction: column;
    gap: 8px;
    font-family: ${DEI_THEME.dark.fontPrimary};
    color: ${DEI_THEME.dark.foreground};
    transition: all 0.2s ease;
  `;
  
  // Create header with title and close button
  const modalHeader = document.createElement('div');
  modalHeader.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    cursor: move;
  `;
  
  const modalTitle = document.createElement('div');
  modalTitle.textContent = 'Voice Assistant';
  modalTitle.style.cssText = `
    font-weight: bold;
    font-size: 14px;
  `;
  
  const closeButton = document.createElement('div');
  closeButton.innerHTML = '&times;';
  closeButton.style.cssText = `
    cursor: pointer;
    font-size: 18px;
    line-height: 14px;
    opacity: 0.7;
    transition: opacity 0.2s;
  `;
  closeButton.addEventListener('mouseenter', () => {
    closeButton.style.opacity = '1';
  });
  closeButton.addEventListener('mouseleave', () => {
    closeButton.style.opacity = '0.7';
  });
  closeButton.addEventListener('click', () => {
    stopRecording();
    transcriptModal.style.display = 'none';
  });
  
  modalHeader.appendChild(modalTitle);
  modalHeader.appendChild(closeButton);
  
  // Create chat container for messages
  const chatContainer = document.createElement('div');
  chatContainer.id = 'dei-chat-container';
  chatContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: 200px;
    overflow-y: auto;
    padding: 8px;
    background-color: ${DEI_THEME.dark.background};
    border-radius: ${DEI_THEME.dark.radius};
    margin-bottom: 8px;
  `;
  
  // Create editable transcript area (will be used inside input section)
  const transcriptArea = document.createElement('div');
  transcriptArea.id = 'dei-transcript-content';
  transcriptArea.contentEditable = true;
  transcriptArea.style.cssText = `
    font-size: 14px;
    min-height: 60px;
    max-height: 100px;
    width: 100%;
    overflow-y: auto;
    padding: 8px;
    background-color: ${DEI_THEME.dark.background};
    border-radius: ${DEI_THEME.dark.radius};
    outline: none;
    border: 1px solid ${DEI_THEME.dark.border};
    white-space: pre-wrap;
    word-break: break-word;
  `;
  transcriptArea.setAttribute('placeholder', 'Type a message or use voice input...');
  
  // Add placeholder behavior
  transcriptArea.dataset.placeholder = 'Type a message or use voice input...';
  const placeholderStyle = document.createElement('style');
  placeholderStyle.textContent = `
    [contenteditable][data-placeholder]:empty:before {
      content: attr(data-placeholder);
      color: ${DEI_THEME.dark.muted};
      cursor: text;
    }
  `;
  document.head.appendChild(placeholderStyle);
  
  // Create input container for editing and sending
  const inputContainer = document.createElement('div');
  inputContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
  `;
  
  // Create button container
  const buttonsContainer = document.createElement('div');
  buttonsContainer.style.cssText = `
    display: flex;
    gap: 8px;
  `;
  
  // Create record button
  const recordButton = document.createElement('button');
  recordButton.id = 'dei-record-button';
  recordButton.innerHTML = '🎙️';
  recordButton.title = 'Start Recording';
  recordButton.style.cssText = `
    background-color: ${DEI_THEME.dark.primary};
    color: ${DEI_THEME.dark.foreground};
    border: none;
    border-radius: ${DEI_THEME.dark.radius};
    padding: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  
  // Add recording indicator/wave
  const recordingWave = document.createElement('div');
  recordingWave.id = 'dei-recording-wave';
  recordingWave.style.cssText = `
    display: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: red;
    position: absolute;
    top: 4px;
    right: 4px;
    animation: pulse 1.5s infinite ease-in-out;
  `;
  
  // Add animation for recording indicator
  const waveStyle = document.createElement('style');
  waveStyle.textContent = `
    @keyframes pulse {
      0% { transform: scale(0.95); opacity: 0.7; }
      50% { transform: scale(1.05); opacity: 0.9; }
      100% { transform: scale(0.95); opacity: 0.7; }
    }
  `;
  document.head.appendChild(waveStyle);
  
  // Create send button
  const sendButton = document.createElement('button');
  sendButton.id = 'dei-send-button';
  sendButton.innerHTML = '↑';
  sendButton.title = 'Send Message';
  sendButton.style.cssText = `
    background-color: ${DEI_THEME.dark.accent};
    color: ${DEI_THEME.dark.foreground};
    border: none;
    border-radius: ${DEI_THEME.dark.radius};
    padding: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  
  // Add click event to record button
  recordButton.addEventListener('click', () => {
    if (!isRecording) {
      startRecording();
      recordButton.innerHTML = '■';
      recordButton.title = 'Stop Recording';
      recordButton.style.backgroundColor = '#dc3545'; // Red for recording
      recordingWave.style.display = 'block';
    } else {
      stopRecording();
      recordButton.innerHTML = '🎙️';
      recordButton.title = 'Start Recording';
      recordButton.style.backgroundColor = DEI_THEME.dark.primary;
      recordingWave.style.display = 'none';
    }
  });
  
  // Add click event to send button
  sendButton.addEventListener('click', () => {
    const text = transcriptArea.innerText.trim();
    if (text) {
      sendTranscript(text);
      transcriptArea.innerText = '';
      
      // Add user message to chat
      addMessageToChat('user', text);
    }
  });
  
  // Allow Enter key to send message (Shift+Enter for new line)
  transcriptArea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendButton.click();
    }
  });
  
  // Add transcript area and buttons to input container
  inputContainer.appendChild(transcriptArea);
  
  // Add recording wave inside record button container
  const recordButtonContainer = document.createElement('div');
  recordButtonContainer.style.cssText = `
    position: relative;
  `;
  recordButtonContainer.appendChild(recordButton);
  recordButtonContainer.appendChild(recordingWave);
  
  // Add buttons to button container
  buttonsContainer.appendChild(recordButtonContainer);
  buttonsContainer.appendChild(sendButton);
  
  // Add button container to input container
  inputContainer.appendChild(buttonsContainer);
  
  // Build the modal
  transcriptModal.appendChild(modalHeader);
  transcriptModal.appendChild(chatContainer);
  transcriptModal.appendChild(inputContainer);
  
  document.body.appendChild(transcriptModal);
  
  // Make transcript modal draggable
  let isDraggingModal = false;
  let modalOffsetX, modalOffsetY;
  
  modalHeader.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only left mouse button
    isDraggingModal = true;
    
    const rect = transcriptModal.getBoundingClientRect();
    modalOffsetX = e.clientX - rect.left;
    modalOffsetY = e.clientY - rect.top;
    
    // Set the container to be movable
    modalHeader.style.cursor = 'grabbing';
    
    // Prevent default to avoid text selection during drag
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDraggingModal) return;
    
    // Update position
    const x = e.clientX - modalOffsetX;
    const y = e.clientY - modalOffsetY;
    
    // Keep within viewport bounds
    const maxX = window.innerWidth - transcriptModal.offsetWidth;
    const maxY = window.innerHeight - transcriptModal.offsetHeight;
    
    transcriptModal.style.left = `${Math.min(Math.max(0, x), maxX)}px`;
    transcriptModal.style.top = `${Math.min(Math.max(0, y), maxY)}px`;
  });
  
  document.addEventListener('mouseup', () => {
    if (isDraggingModal) {
      isDraggingModal = false;
      modalHeader.style.cursor = 'move';
    }
  });
  
  debugLog("Transcript modal created");
}

// Function to add message to chat
function addMessageToChat(sender, text) {
  const chatContainer = document.getElementById('dei-chat-container');
  if (!chatContainer) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `dei-chat-message dei-${sender}-message`;
  messageDiv.style.cssText = `
    padding: 8px 12px;
    border-radius: ${DEI_THEME.dark.radius};
    max-width: 80%;
    word-wrap: break-word;
    margin-bottom: 4px;
    align-self: ${sender === 'user' ? 'flex-end' : 'flex-start'};
    background-color: ${sender === 'user' ? DEI_THEME.dark.primary : DEI_THEME.dark.secondary};
  `;
  
  messageDiv.innerText = text;
  chatContainer.appendChild(messageDiv);
  
  // Scroll to bottom
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Function to toggle transcript modal
function toggleTranscriptModal() {
  debugLog("Toggling transcript modal");
  
  if (transcriptModal) {
    // If modal is not visible, position it near the Talk button
    if (transcriptModal.style.display !== 'flex') {
      const talkButton = document.getElementById('dei-talk-option');
      if (talkButton) {
        const rect = talkButton.getBoundingClientRect();
        transcriptModal.style.left = `${rect.left - 150}px`; // Center aligned with button
        transcriptModal.style.top = `${rect.top - 280}px`; // Position above the button
      } else {
        // Default position if button not found
        transcriptModal.style.left = '50%';
        transcriptModal.style.top = '50%';
        transcriptModal.style.transform = 'translate(-50%, -50%)';
      }
      
      // Show the modal
      transcriptModal.style.display = 'flex';
      
      // Focus the input area
      const transcriptArea = document.getElementById('dei-transcript-content');
      if (transcriptArea) {
        transcriptArea.focus();
      }
    } else {
      // Hide the modal and stop recording if active
      if (isRecording) {
        stopRecording();
        const recordButton = document.getElementById('dei-record-button');
        if (recordButton) {
          recordButton.innerHTML = '🎙️';
          recordButton.title = 'Start Recording';
          recordButton.style.backgroundColor = DEI_THEME.dark.primary;
        }
        const recordingWave = document.getElementById('dei-recording-wave');
        if (recordingWave) {
          recordingWave.style.display = 'none';
        }
      }
      transcriptModal.style.display = 'none';
    }
  }
}

// Start recording audio
async function startRecording() {
  try {
    debugLog("Starting recording");
    
    // Get the audio stream
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };
    
    mediaRecorder.onstop = async () => {
      // Create audio blob for sending
      const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
      
      // Get the transcript from the editable area
      const transcriptArea = document.getElementById('dei-transcript-content');
      
      // If we have transcript content from recognition, use it
      if (transcriptContent.trim() && transcriptArea) {
        // Set the recognized text to the editable area
        transcriptArea.innerText = transcriptContent;
        
        // Don't automatically send - let user edit and send manually
        // Focus the transcript area for editing
        transcriptArea.focus();
      } else if (transcriptArea) {
        // No transcript from recognition
        transcriptArea.innerText = "Could not transcribe audio. Please type your message.";
        transcriptArea.focus();
        transcriptArea.select(); // Select all text for easy replacement
      }
    };
    
    // Start recording audio
    mediaRecorder.start();
    isRecording = true;
    
    // Reset transcript content
    transcriptContent = '';
    
    // Start live transcription concurrently
    if (!("webkitSpeechRecognition" in window)) {
      const transcriptArea = document.getElementById('dei-transcript-content');
      if (transcriptArea) {
        transcriptArea.innerText = "Speech recognition not supported in this browser.";
      }
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
      
      // Update transcript content
      transcriptContent = finalTranscript;
      
      // Update display in editable area
      const transcriptArea = document.getElementById('dei-transcript-content');
      if (transcriptArea) {
        transcriptArea.innerText = `${finalTranscript} ${interimTranscript}`;
      }
    };
    
    recognition.onend = () => {
      if (isRecording) {
        // If recording is still active but recognition ended, restart it
        recognition.start();
      }
    };
    
    recognition.start();
    
    debugLog("Recording started");
  } catch (error) {
    console.error("Error accessing microphone:", error);
    
    const transcriptArea = document.getElementById('dei-transcript-content');
    if (transcriptArea) {
      transcriptArea.innerText = "Microphone access denied. Please allow access in browser settings.";
    }
    
    isRecording = false;
    const recordButton = document.getElementById('dei-record-button');
    if (recordButton) {
      recordButton.innerHTML = '🎙️';
      recordButton.title = 'Start Recording';
      recordButton.style.backgroundColor = DEI_THEME.dark.primary;
    }
    const recordingWave = document.getElementById('dei-recording-wave');
    if (recordingWave) {
      recordingWave.style.display = 'none';
    }
  }
}

// Stop recording
function stopRecording() {
  debugLog("Stopping recording");
  
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    
    // Stop all tracks in the stream
    if (mediaRecorder.stream) {
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    
    isRecording = false;
    
    if (recognition) {
      recognition.stop();
    }
    
    debugLog("Recording stopped");
  }
}

// Send transcript to backend
async function sendTranscript(transcript) {
  try {
    debugLog("Sending transcript to backend");
    
    // Add loading indicator to chat
    addMessageToChat('assistant', 'Processing your request...');
    
    const response = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    });
    
    const data = await response.json();
    console.log("Backend response:", data);
    
    // Get the chat container to remove the last message (loading indicator)
    const chatContainer = document.getElementById('dei-chat-container');
    if (chatContainer && chatContainer.lastChild) {
      chatContainer.removeChild(chatContainer.lastChild);
    }
    
    // Add response to chat
    if (data.response) {
      addMessageToChat('assistant', data.response);
    } else if (data.selected_tool) {
      addMessageToChat('assistant', `Tool selected: ${data.selected_tool}`);
    } else if (data.summary) {
      addMessageToChat('assistant', data.summary);
    } else {
      addMessageToChat('assistant', "Received your message.");
    }
    
    debugLog("Transcript processed");
  } catch (error) {
    console.error("Error sending transcript:", error);
    
    // Get the chat container to remove the last message (loading indicator)
    const chatContainer = document.getElementById('dei-chat-container');
    if (chatContainer && chatContainer.lastChild) {
      chatContainer.removeChild(chatContainer.lastChild);
    }
    
    // Add error message to chat
    addMessageToChat('assistant', "Error processing your request. Please try again.");
  }
}

// Create the form fill submenu with two options
function createFormFillSubmenu() {
  debugLog("Creating form fill submenu");
  
  // Create submenu container
  const submenu = document.createElement('div');
  submenu.id = 'dei-form-submenu';
  submenu.style.cssText = `
    position: fixed;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 9996;
    transition: all 0.2s ease;
    opacity: 0;
  `;
  
  // Create the two submenu buttons
  const knowledgeButton = createSubmenuButton('dei-knowledge-button', '📚', 'Add to Knowledge Base', openKnowledgeBase);
  const fillFormButton = createSubmenuButton('dei-fill-form-button', '✍️', 'Fill Form', fillFormAction);
  
  // Add buttons to submenu
  submenu.appendChild(knowledgeButton);
  submenu.appendChild(fillFormButton);
  
  // Add submenu to document
  document.body.appendChild(submenu);
  
  // Position and show the submenu
  showFormFillSubmenu();
}

// Create a submenu button with specified properties
function createSubmenuButton(id, icon, tooltip, action) {
  const button = document.createElement('div');
  button.id = id;
  button.className = 'dei-menu-option';
  button.innerHTML = icon;
  button.style.opacity = '1';
  button.style.pointerEvents = 'auto';
  
  // Create tooltip for this button
  const buttonTooltip = document.createElement('div');
  buttonTooltip.id = `${id}-tooltip`;
  buttonTooltip.className = 'dei-tooltip';
  buttonTooltip.textContent = tooltip;
  document.body.appendChild(buttonTooltip);
  
  // Add hover events for tooltip
  button.addEventListener('mouseover', () => {
    const rect = button.getBoundingClientRect();
    buttonTooltip.style.top = rect.top + 'px';
    buttonTooltip.style.left = (rect.right + 10) + 'px';
    buttonTooltip.style.opacity = '1';
  });
  
  button.addEventListener('mouseout', () => {
    buttonTooltip.style.opacity = '0';
  });
  
  // Add click event
  button.addEventListener('click', action);
  
  return button;
}

// Show the form fill submenu
function showFormFillSubmenu() {
  const submenu = document.getElementById('dei-form-submenu');
  if (!submenu) return;
  
  // Position submenu relative to the form button
  const formButton = document.getElementById('dei-form-option');
  if (formButton) {
    const rect = formButton.getBoundingClientRect();
    submenu.style.top = `${rect.top - 120}px`;
    submenu.style.left = `${rect.left}px`;
  }
  
  // Show submenu with animation
  submenu.style.display = 'flex';
  setTimeout(() => {
    submenu.style.opacity = '1';
  }, 10);
}

// Hide the form fill submenu
function hideFormFillSubmenu() {
  const submenu = document.getElementById('dei-form-submenu');
  if (!submenu) return;
  
  submenu.style.opacity = '0';
  setTimeout(() => {
    submenu.style.display = 'none';
  }, 200);
}

// Open knowledge base modal
function openKnowledgeBase() {
  debugLog("Opening knowledge base");
  
  // Hide the submenu if it exists
  const submenu = document.getElementById('dei-form-submenu');
  if (submenu) {
    submenu.style.opacity = '0';
    setTimeout(() => {
      submenu.style.display = 'none';
    }, 200);
  }
  
  // Open the knowledge base in a new tab
  chrome.runtime.sendMessage({
    action: "openKnowledgeBase"
  });
  
  // Show a toast message
  showToast("Opening knowledge base...", 2000);
}

// Create knowledge base modal
function createKnowledgeBaseModal() {
  debugLog("Creating knowledge base modal");
  
  // Create modal container
  const modal = document.createElement('div');
  modal.id = 'dei-knowledge-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    font-family: ${DEI_THEME.dark.fontPrimary};
    backdrop-filter: blur(4px);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  `;
  
  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background-color: ${DEI_THEME.dark.card};
    width: 85%;
    max-width: 600px;
    max-height: 85%;
    overflow-y: auto;
    border-radius: ${DEI_THEME.dark.radius};
    border: 1px solid ${DEI_THEME.dark.border};
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    padding: 24px;
    position: relative;
    color: ${DEI_THEME.dark.foreground};
    display: flex;
    flex-direction: column;
    gap: 16px;
    animation: modalFadeIn 0.3s ease-out;
  `;
  
  // Create close button
  const closeButton = document.createElement('div');
  closeButton.innerHTML = '&times;';
  closeButton.style.cssText = `
    position: absolute;
    top: 16px;
    right: 16px;
    font-size: 24px;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.2s;
    z-index: 1;
  `;
  closeButton.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  
  // Create title
  const title = document.createElement('h2');
  title.textContent = 'Knowledge Base';
  title.style.cssText = `
    margin: 0 0 16px 0;
    font-size: 20px;
    font-weight: 600;
  `;
  
  // Create knowledge items container
  const knowledgeContainer = document.createElement('div');
  knowledgeContainer.id = 'dei-knowledge-items';
  knowledgeContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 300px;
    overflow-y: auto;
    padding: 12px;
    background-color: ${DEI_THEME.dark.background};
    border-radius: ${DEI_THEME.dark.radius};
  `;
  
  // Create input container similar to chat interface
  const inputContainer = document.createElement('div');
  inputContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
  `;
  
  // Create editable content area
  const inputArea = document.createElement('div');
  inputArea.id = 'dei-knowledge-input';
  inputArea.contentEditable = true;
  inputArea.style.cssText = `
    font-size: 14px;
    min-height: 60px;
    max-height: 120px;
    width: 100%;
    overflow-y: auto;
    padding: 8px;
    background-color: ${DEI_THEME.dark.background};
    border-radius: ${DEI_THEME.dark.radius};
    outline: none;
    border: 1px solid ${DEI_THEME.dark.border};
    white-space: pre-wrap;
    word-break: break-word;
  `;
  inputArea.dataset.placeholder = 'Add new information to your knowledge base...';
  
  // Create button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = `
    display: flex;
    gap: 8px;
  `;
  
  // Create record button container
  const recordButtonContainer = document.createElement('div');
  recordButtonContainer.style.cssText = `
    position: relative;
  `;
  
  // Create record button for knowledge input
  const recordButton = document.createElement('button');
  recordButton.id = 'dei-knowledge-record-button';
  recordButton.innerHTML = '🎙️';
  recordButton.title = 'Record Voice Input';
  recordButton.style.cssText = `
    background-color: ${DEI_THEME.dark.primary};
    color: ${DEI_THEME.dark.foreground};
    border: none;
    border-radius: ${DEI_THEME.dark.radius};
    padding: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  
  // Create recording indicator for knowledge input
  const recordingWave = document.createElement('div');
  recordingWave.id = 'dei-knowledge-recording-wave';
  recordingWave.style.cssText = `
    display: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: red;
    position: absolute;
    top: 4px;
    right: 4px;
    animation: pulse 1.5s infinite ease-in-out;
  `;
  
  // Create add button
  const addButton = document.createElement('button');
  addButton.id = 'dei-knowledge-add-button';
  addButton.innerHTML = 'Add';
  addButton.style.cssText = `
    background-color: ${DEI_THEME.dark.accent};
    color: ${DEI_THEME.dark.foreground};
    border: none;
    border-radius: ${DEI_THEME.dark.radius};
    padding: 8px 16px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
  `;
  
  // Add click event to record button
  recordButton.addEventListener('click', () => {
    if (!isRecording) {
      startKnowledgeRecording();
      recordButton.innerHTML = '■';
      recordButton.title = 'Stop Recording';
      recordButton.style.backgroundColor = '#dc3545'; // Red for recording
      recordingWave.style.display = 'block';
    } else {
      stopKnowledgeRecording();
      recordButton.innerHTML = '🎙️';
      recordButton.title = 'Record Voice Input';
      recordButton.style.backgroundColor = DEI_THEME.dark.primary;
      recordingWave.style.display = 'none';
    }
  });
  
  // Add click event to add button
  addButton.addEventListener('click', addToKnowledgeBase);
  
  // Allow Enter key to add item (Shift+Enter for new line)
  inputArea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addButton.click();
    }
  });
  
  // Build the modal
  recordButtonContainer.appendChild(recordButton);
  recordButtonContainer.appendChild(recordingWave);
  buttonContainer.appendChild(recordButtonContainer);
  buttonContainer.appendChild(addButton);
  
  inputContainer.appendChild(inputArea);
  inputContainer.appendChild(buttonContainer);
  
  modalContent.appendChild(closeButton);
  modalContent.appendChild(title);
  modalContent.appendChild(knowledgeContainer);
  modalContent.appendChild(inputContainer);
  
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
  
  // Display knowledge items
  displayKnowledgeItems();
}

// Function to start recording for knowledge base
async function startKnowledgeRecording() {
  try {
    debugLog("Starting knowledge recording");
    
    // Get the audio stream
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };
    
    mediaRecorder.onstop = async () => {
      // Create audio blob for sending
      const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
      
      // Get the transcript from the editable area
      const inputArea = document.getElementById('dei-knowledge-input');
      
      // If we have transcript content from recognition, use it
      if (transcriptContent.trim() && inputArea) {
        // Set the recognized text to the editable area
        inputArea.innerText = transcriptContent;
        
        // Focus the input area for editing
        inputArea.focus();
      } else if (inputArea) {
        // No transcript from recognition
        inputArea.innerText = "Could not transcribe audio. Please type your information.";
        inputArea.focus();
        inputArea.select(); // Select all text for easy replacement
      }
    };
    
    // Start recording audio
    mediaRecorder.start();
    isRecording = true;
    
    // Reset transcript content
    transcriptContent = '';
    
    // Start live transcription concurrently
    if (!("webkitSpeechRecognition" in window)) {
      const inputArea = document.getElementById('dei-knowledge-input');
      if (inputArea) {
        inputArea.innerText = "Speech recognition not supported in this browser.";
      }
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
      
      // Update transcript content
      transcriptContent = finalTranscript;
      
      // Update display in editable area
      const inputArea = document.getElementById('dei-knowledge-input');
      if (inputArea) {
        inputArea.innerText = `${finalTranscript} ${interimTranscript}`;
      }
    };
    
    recognition.onend = () => {
      if (isRecording) {
        // If recording is still active but recognition ended, restart it
        recognition.start();
      }
    };
    
    recognition.start();
    
    debugLog("Knowledge recording started");
  } catch (error) {
    console.error("Error accessing microphone:", error);
    
    const inputArea = document.getElementById('dei-knowledge-input');
    if (inputArea) {
      inputArea.innerText = "Microphone access denied. Please allow access in browser settings.";
    }
    
    isRecording = false;
    const recordButton = document.getElementById('dei-knowledge-record-button');
    if (recordButton) {
      recordButton.innerHTML = '🎙️';
      recordButton.title = 'Record Voice Input';
      recordButton.style.backgroundColor = DEI_THEME.dark.primary;
    }
    const recordingWave = document.getElementById('dei-knowledge-recording-wave');
    if (recordingWave) {
      recordingWave.style.display = 'none';
    }
  }
}

// Function to stop knowledge recording
function stopKnowledgeRecording() {
  debugLog("Stopping knowledge recording");
  
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    
    // Stop all tracks in the stream
    if (mediaRecorder.stream) {
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    
    isRecording = false;
    
    if (recognition) {
      recognition.stop();
    }
    
    debugLog("Knowledge recording stopped");
  }
}

// Function to add item to knowledge base
function addToKnowledgeBase() {
  const inputArea = document.getElementById('dei-knowledge-input');
  if (!inputArea) return;
  
  const text = inputArea.innerText.trim();
  if (!text) return;
  
  // Get existing knowledge items from local storage
  let knowledgeItems = JSON.parse(localStorage.getItem('deiKnowledgeBase') || '[]');
  
  // Add new item with timestamp
  knowledgeItems.push({
    id: Date.now(),
    text: text,
    date: new Date().toISOString()
  });
  
  // Save to local storage
  localStorage.setItem('deiKnowledgeBase', JSON.stringify(knowledgeItems));
  
  // Clear input area
  inputArea.innerText = '';
  
  // Display updated items
  displayKnowledgeItems();
  
  // Show success message
  showToast('Added to your knowledge base', 2000);
}

// Function to display knowledge items
function displayKnowledgeItems() {
  const container = document.getElementById('dei-knowledge-items');
  if (!container) return;
  
  // Get items from local storage
  const knowledgeItems = JSON.parse(localStorage.getItem('deiKnowledgeBase') || '[]');
  
  // Clear the container
  container.innerHTML = '';
  
  if (knowledgeItems.length === 0) {
    // Show empty state
    const emptyState = document.createElement('div');
    emptyState.style.cssText = `
      text-align: center;
      color: ${DEI_THEME.dark.muted};
      padding: 24px 0;
    `;
    emptyState.innerText = 'No items in your knowledge base yet. Add information below.';
    container.appendChild(emptyState);
    return;
  }
  
  // Add each item
  knowledgeItems.forEach(item => {
    const itemElement = document.createElement('div');
    itemElement.className = 'dei-knowledge-item';
    itemElement.style.cssText = `
      background-color: ${DEI_THEME.dark.secondary};
      border-radius: ${DEI_THEME.dark.radius};
      padding: 12px;
      position: relative;
    `;
    
    // Format date
    const date = new Date(item.date);
    const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    
    // Create delete button
    const deleteButton = document.createElement('button');
    deleteButton.innerHTML = '&times;';
    deleteButton.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      background: none;
      border: none;
      color: ${DEI_THEME.dark.muted};
      font-size: 16px;
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.2s;
    `;
    deleteButton.addEventListener('mouseenter', () => {
      deleteButton.style.opacity = '1';
    });
    deleteButton.addEventListener('mouseleave', () => {
      deleteButton.style.opacity = '0.7';
    });
    deleteButton.addEventListener('click', () => {
      deleteKnowledgeItem(item.id);
    });
    
    // Create item content
    const itemContent = document.createElement('div');
    itemContent.style.cssText = `
      margin-right: 20px;
      word-break: break-word;
    `;
    itemContent.innerText = item.text;
    
    // Create time element
    const timeElement = document.createElement('div');
    timeElement.style.cssText = `
      font-size: 12px;
      color: ${DEI_THEME.dark.muted};
      margin-top: 8px;
    `;
    timeElement.innerText = formattedDate;
    
    // Build the item
    itemElement.appendChild(deleteButton);
    itemElement.appendChild(itemContent);
    itemElement.appendChild(timeElement);
    
    container.appendChild(itemElement);
  });
}

// Function to delete a knowledge item
function deleteKnowledgeItem(id) {
  // Get existing knowledge items
  let knowledgeItems = JSON.parse(localStorage.getItem('deiKnowledgeBase') || '[]');
  
  // Filter out the item to delete
  knowledgeItems = knowledgeItems.filter(item => item.id !== id);
  
  // Save updated items
  localStorage.setItem('deiKnowledgeBase', JSON.stringify(knowledgeItems));
  
  // Update the display
  displayKnowledgeItems();
  
  // Show success message
  showToast('Item deleted', 2000);
}

// Function to handle form filling
async function fillFormAction() {
  try {
    // Show processing toast
    showToast('Analyzing form elements...', 2000);
    
    // First, immediately sync knowledge base data
    debugLog("Syncing knowledge base data before parsing form");
    await syncKnowledgeBaseData();
    
    // Parse form elements
    const formElements = parseFormElements();
    
    if (!formElements || formElements.length === 0) {
      showToast('No form elements found on this page', 3000);
      return;
    }
    
    // Show processing toast
    showToast(`Found ${formElements.length} form elements. Processing...`, 3000);
    
    // Send form elements to backend
    await sendFormDataToBackend(formElements);
  } catch (error) {
    console.error("Error in fillFormAction:", error);
    showToast(`Error: ${error.message}`, 3000);
  }
}

// Function to parse form elements from the page
function parseFormElements() {
  const formElements = [];
  
  debugLog("Starting form element parsing");
  
  // Part 1: Handle traditional HTML radio buttons
  const radioGroups = new Map();
  document.querySelectorAll('input[type="radio"]').forEach((radio, index) => {
    if (!radio.name) {
      debugLog(`Radio button without name, skipping grouping: ${radio.id || "unnamed"}`);
      return;
    }
    
    if (!radioGroups.has(radio.name)) {
      radioGroups.set(radio.name, []);
    }
    radioGroups.get(radio.name).push(radio);
  });
  
  debugLog(`Found ${radioGroups.size} traditional radio button groups`);
  
  // Part 2: Handle ARIA-based radio groups (like Google Forms)
  const ariaRadioGroups = new Map();
  
  // Find all elements with role="radiogroup"
  document.querySelectorAll('[role="radiogroup"]').forEach((group, index) => {
    const groupId = group.id || `aria_radio_group_${index}`;
    debugLog(`Found ARIA radio group: ${groupId}`);
    
    // Find all radio buttons within this group
    const radioButtons = group.querySelectorAll('[role="radio"]');
    if (radioButtons.length > 0) {
      ariaRadioGroups.set(groupId, {
        container: group,
        buttons: Array.from(radioButtons)
      });
    }
  });
  
  debugLog(`Found ${ariaRadioGroups.size} ARIA radio button groups`);
  
  // Process traditional radio groups
  radioGroups.forEach((radios, groupName) => {
    debugLog(`Processing traditional radio group: ${groupName} with ${radios.length} options`);
    
    // Find common container to help determine the group label
    const container = findCommonContainer(radios);
    
    // Try to find the label for the radio group
    let groupLabel = '';
    
    // Method 1: Check if there's a fieldset with legend
    if (container && container.tagName === 'FIELDSET') {
      const legend = container.querySelector('legend');
      if (legend) {
        groupLabel = legend.textContent.trim();
        debugLog(`Found fieldset legend label: "${groupLabel}"`);
      }
    }
    
    // Method 2: Look for heading elements near the container
    if (!groupLabel && container) {
      const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6, p.form-label, label.form-label, div.form-label');
      if (headings.length > 0) {
        groupLabel = headings[0].textContent.trim();
        debugLog(`Found heading label: "${groupLabel}"`);
      }
    }
    
    // Method 3: Check for a label that refers to the first radio's id
    if (!groupLabel && radios[0].id) {
      const label = document.querySelector(`label[for="${radios[0].id}"]`);
      if (label && label.parentElement) {
        // Try to get the parent's text that's not in the label
        const parent = label.parentElement;
        const parentText = Array.from(parent.childNodes)
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent.trim())
          .join(' ')
          .trim();
          
        if (parentText) {
          groupLabel = parentText;
          debugLog(`Found parent text label: "${groupLabel}"`);
        }
      }
    }
    
    // Method 4: Fallback to the name attribute if no label is found
    if (!groupLabel) {
      groupLabel = groupName.replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .replace(/-/g, ' ')
        .trim();
      debugLog(`Using formatted name as label: "${groupLabel}"`);
    }
    
    // Get the options for the radio group
    const options = radios.map(radio => {
      let optionText = '';
      
      // Method 1: Check for associated label
      if (radio.id) {
        const label = document.querySelector(`label[for="${radio.id}"]`);
        if (label) {
          optionText = label.textContent.trim();
          debugLog(`Found label for option: "${optionText}"`);
        }
      }
      
      // Method 2: Check if radio is inside a label
      if (!optionText) {
        const parentLabel = radio.closest('label');
        if (parentLabel) {
          // Get text content but exclude text from any child inputs
          optionText = Array.from(parentLabel.childNodes)
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent.trim())
            .join(' ')
            .trim();
          debugLog(`Found parent label text: "${optionText}"`);
        }
      }
      
      // Method 3: Check next sibling for text
      if (!optionText) {
        let sibling = radio.nextSibling;
        while (sibling && !optionText) {
          if (sibling.nodeType === Node.TEXT_NODE && sibling.textContent.trim()) {
            optionText = sibling.textContent.trim();
            debugLog(`Found sibling text: "${optionText}"`);
          } else if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === 'LABEL') {
            optionText = sibling.textContent.trim();
            debugLog(`Found sibling label: "${optionText}"`);
            break;
          }
          sibling = sibling.nextSibling;
        }
      }
      
      // Method 4: Fallback to value attribute
      if (!optionText) {
        optionText = radio.value;
        debugLog(`Using value as option text: "${optionText}"`);
      }
      
      return {
        value: radio.value,
        text: optionText
      };
    });
    
    // Get position, path, and surrounding context for the radio group
    const firstRadio = radios[0];
    const position = {
      x: firstRadio.getBoundingClientRect().left,
      y: firstRadio.getBoundingClientRect().top
    };
    const positionPath = getElementPath(firstRadio);
    const surroundingContext = getSurroundingText(container || firstRadio);
    
    // Create a unique ID for the group
    const groupId = `radio_group_${groupName}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add the radio group to formElements
    formElements.push({
      type: 'radio_group',
      id: groupId,
      name: groupName,
      label: groupLabel,
      element: firstRadio,
      options: options,
      possibleValues: options, // Add possibleValues to match expected format
      position: position,
      positionPath: positionPath,
      surroundingContext: surroundingContext
    });
  });
  
  // Process ARIA-based radio groups
  ariaRadioGroups.forEach((group, groupId) => {
    const container = group.container;
    const radioButtons = group.buttons;
    
    debugLog(`Processing ARIA radio group: ${groupId} with ${radioButtons.length} options`);
    
    // Try to find the label for the ARIA radio group
    let groupLabel = '';
    
    // Method 1: Check if the radiogroup has aria-labelledby
    if (container.hasAttribute('aria-labelledby')) {
      const labelledById = container.getAttribute('aria-labelledby');
      const labelElement = document.getElementById(labelledById);
      if (labelElement) {
        groupLabel = labelElement.textContent.trim();
        debugLog(`Found aria-labelledby label: "${groupLabel}"`);
      }
    }
    
    // Method 2: Look for heading elements with role="heading" nearby
    if (!groupLabel) {
      // Look up to 3 parent levels up
      let currentElement = container;
      let found = false;
      
      for (let i = 0; i < 3 && !found && currentElement; i++) {
        // Check for role="heading" elements
        const headings = currentElement.querySelectorAll('[role="heading"]');
        if (headings.length > 0) {
          groupLabel = headings[0].textContent.trim();
          debugLog(`Found role="heading" label: "${groupLabel}"`);
          found = true;
          break;
        }
        
        // Check for regular heading elements too
        const regularHeadings = currentElement.querySelectorAll('h1, h2, h3, h4, h5, h6');
        if (regularHeadings.length > 0) {
          groupLabel = regularHeadings[0].textContent.trim();
          debugLog(`Found regular heading label: "${groupLabel}"`);
          found = true;
          break;
        }
        
        // Move up to parent
        currentElement = currentElement.parentElement;
      }
    }
    
    // Method 3: If still no label, check siblings of container
    if (!groupLabel && container.parentElement) {
      // Check previous siblings
      let prevSibling = container.previousElementSibling;
      while (prevSibling && !groupLabel) {
        // Check if this sibling is a heading or has role="heading"
        if (prevSibling.matches('h1, h2, h3, h4, h5, h6') || 
            prevSibling.getAttribute('role') === 'heading') {
          groupLabel = prevSibling.textContent.trim();
          debugLog(`Found sibling heading label: "${groupLabel}"`);
          break;
        }
        
        // Or check if it contains a heading
        const nestedHeadings = prevSibling.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]');
        if (nestedHeadings.length > 0) {
          groupLabel = nestedHeadings[0].textContent.trim();
          debugLog(`Found nested heading in sibling: "${groupLabel}"`);
          break;
        }
        
        prevSibling = prevSibling.previousElementSibling;
      }
    }
    
    // Method 4: Generic fallback if no label found
    if (!groupLabel) {
      groupLabel = `Question ${formElements.length + 1}`;
      debugLog(`Using generic label: "${groupLabel}"`);
    }
    
    // Extract options from ARIA radio buttons
    const options = radioButtons.map(button => {
      // Try to get option text from various sources
      let optionText = '';
      
      // Method 1: Check aria-label attribute
      if (button.hasAttribute('aria-label')) {
        optionText = button.getAttribute('aria-label');
        debugLog(`Found aria-label for option: "${optionText}"`);
      }
      
      // Method 2: Check data-value attribute (common in Google Forms)
      if (!optionText && button.hasAttribute('data-value')) {
        optionText = button.getAttribute('data-value');
        debugLog(`Found data-value for option: "${optionText}"`);
      }
      
      // Method 3: Look for text inside the button
      if (!optionText) {
        // Find span elements containing text
        const textSpans = button.querySelectorAll('span:not(:empty)');
        if (textSpans.length > 0) {
          optionText = textSpans[0].textContent.trim();
          debugLog(`Found text span in button: "${optionText}"`);
        }
      }
      
      // Method 4: Look for text in parent label
      if (!optionText) {
        const parentLabel = button.closest('label');
        if (parentLabel) {
          // Find spans with text
          const spans = parentLabel.querySelectorAll('span:not(:empty)');
          if (spans.length > 0) {
            optionText = spans[spans.length - 1].textContent.trim(); // Often the last span has the text
            debugLog(`Found text in parent label span: "${optionText}"`);
          } else {
            // If no spans, use the label text
            optionText = parentLabel.textContent.trim();
            debugLog(`Using parent label text: "${optionText}"`);
          }
        }
      }
      
      // Method 5: Generic fallback
      if (!optionText) {
        optionText = `Option ${radioButtons.indexOf(button) + 1}`;
        debugLog(`Using generic option text: "${optionText}"`);
      }
      
      // Determine value - use optionText if no explicit value is found
      const value = button.hasAttribute('data-value') ? 
                   button.getAttribute('data-value') : 
                   optionText;
      
      return {
        value: value,
        text: optionText
      };
    });
    
    // Get position info for the first radio button
    const firstButton = radioButtons[0];
    const position = {
      x: firstButton.getBoundingClientRect().left,
      y: firstButton.getBoundingClientRect().top
    };
    const positionPath = getElementPath(firstButton);
    const surroundingContext = getSurroundingText(container);
    
    // Create a unique ID for this ARIA radio group
    const uniqueGroupId = `aria_radio_group_${groupId}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add ARIA radio group to form elements
    formElements.push({
      type: 'radio_group',
      id: uniqueGroupId,
      name: groupId,
      label: groupLabel,
      element: firstButton,
      options: options,
      possibleValues: options, // Add possibleValues to match expected format
      position: position,
      positionPath: positionPath,
      surroundingContext: surroundingContext,
      isAriaGroup: true
    });
  });
  
  // Part 3: Look for other forms of custom radio/option groups (like divs with selected class, etc.)
  // This is for sites that use completely custom implementations
  
  // Look for elements that might be custom radio groups
  const potentialCustomGroups = Array.from(document.querySelectorAll('.radio-group, .option-group, .choices, [data-type="radio-group"]'));
  
  // Also look for div containers that have child elements with 'selected' or 'active' classes
  document.querySelectorAll('div, ul').forEach(container => {
    // Check if this container has children with selected/active classes
    const hasSelectedChildren = container.querySelector('.selected, .active, .checked, [aria-selected="true"], [aria-checked="true"]');
    if (hasSelectedChildren) {
      // This might be a custom radio/select group
      potentialCustomGroups.push(container);
    }
  });
  
  debugLog(`Found ${potentialCustomGroups.length} potential custom radio/option groups`);
  
  // Process each potential custom group
  potentialCustomGroups.forEach((container, index) => {
    // Skip if this container is already part of a radio group we processed
    const isAlreadyProcessed = formElements.some(el => 
      el.type === 'radio_group' && 
      (el.element.closest(`#${container.id}`) || container.contains(el.element))
    );
    
    if (isAlreadyProcessed) {
      return;
    }
    
    // Look for elements that might be options in this container
    const potentialOptions = container.querySelectorAll('.option, .choice, .radio, li, [role="option"], [role="menuitem"]');
    
    if (potentialOptions.length < 2) {
      // Need at least 2 options to be considered a proper group
      return;
    }
    
    debugLog(`Processing potential custom group with ${potentialOptions.length} options`);
    
    // Look for a label for this group
    let groupLabel = '';
    
    // Check for a preceding heading
    let currentElement = container;
    for (let i = 0; i < 3 && currentElement && !groupLabel; i++) {
      // Check for headings before this element
      if (currentElement.previousElementSibling) {
        const prevElement = currentElement.previousElementSibling;
        if (prevElement.matches('h1, h2, h3, h4, h5, h6, label, .label, .heading')) {
          groupLabel = prevElement.textContent.trim();
          debugLog(`Found preceding heading for custom group: "${groupLabel}"`);
        }
      }
      
      // Check if parent has a heading child that comes before this container
      if (!groupLabel && currentElement.parentElement) {
        const parent = currentElement.parentElement;
        const headings = Array.from(parent.querySelectorAll('h1, h2, h3, h4, h5, h6, label, .label, .heading'));
        
        // Find a heading that comes before this container
        for (const heading of headings) {
          if (parent.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_PRECEDING) {
            groupLabel = heading.textContent.trim();
            debugLog(`Found heading in parent for custom group: "${groupLabel}"`);
            break;
          }
        }
      }
      
      currentElement = currentElement.parentElement;
    }
    
    // Generic fallback for group label
    if (!groupLabel) {
      // Try to use container's aria-label or title if available
      groupLabel = container.getAttribute('aria-label') || 
                  container.getAttribute('title') || 
                  `Custom Group ${index + 1}`;
      debugLog(`Using fallback label for custom group: "${groupLabel}"`);
    }
    
    // Extract options
    const options = Array.from(potentialOptions).map((option, idx) => {
      let optionText = '';
      
      // Try to get text from various sources
      if (option.textContent.trim()) {
        optionText = option.textContent.trim();
      } else {
        // Look for child elements with text
        const textElements = option.querySelectorAll('span, div, p');
        for (const el of textElements) {
          if (el.textContent.trim()) {
            optionText = el.textContent.trim();
            break;
          }
        }
      }
      
      // Fallback
      if (!optionText) {
        optionText = `Option ${idx + 1}`;
      }
      
      // Try to determine value
      let value = option.getAttribute('data-value') || 
                 option.getAttribute('value') || 
                 optionText;
                 
      return {
        value: value,
        text: optionText
      };
    });
    
    // Get position info
    const position = {
      x: container.getBoundingClientRect().left,
      y: container.getBoundingClientRect().top
    };
    const positionPath = getElementPath(container);
    const surroundingContext = getSurroundingText(container);
    
    // Create unique ID
    const customGroupId = `custom_group_${index}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Add to form elements
    formElements.push({
      type: 'radio_group', // Treat custom groups as radio groups
      id: customGroupId,
      name: container.id || `custom_group_${index}`,
      label: groupLabel,
      element: container,
      options: options,
      possibleValues: options, // Add possibleValues to match expected format
      position: position,
      positionPath: positionPath,
      surroundingContext: surroundingContext,
      isCustomGroup: true
    });
  });
  
  // Get all non-radio input elements
  const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]):not([type="radio"]), select, textarea');
  
  debugLog(`Found ${inputs.length} non-radio input elements`);
  
  // Process each non-radio input
  inputs.forEach((input, index) => {
    // Skip if this is already covered in a radio group
    if (input.type === 'radio') {
      return;
    }
    
    // Generate a unique ID if the element doesn't have one
    const elementId = input.id || input.name || `element_${index}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Try to find the label text
    let labelText = '';
    
    // Method 1: Check for an associated label element
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) {
        labelText = label.textContent.trim();
      }
    }
    
    // Method 2: Check if input is inside a label
    if (!labelText) {
      const parentLabel = input.closest('label');
      if (parentLabel) {
        // Get text content but exclude text from any child inputs
        labelText = Array.from(parentLabel.childNodes)
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent.trim())
          .join(' ')
          .trim();
      }
    }
    
    // Method 3: Check for placeholder attribute
    if (!labelText && input.placeholder) {
      labelText = input.placeholder;
    }
    
    // Method 4: Check for aria-label attribute
    if (!labelText && input.getAttribute('aria-label')) {
      labelText = input.getAttribute('aria-label');
    }
    
    // Method 5: Look for a preceding heading or paragraph
    if (!labelText) {
      const prevElements = [];
      let current = input.previousElementSibling;
      let count = 0;
      
      while (current && count < 3) {
        prevElements.unshift(current);
        current = current.previousElementSibling;
        count++;
      }
      
      for (const prev of prevElements) {
        if (prev.tagName.match(/^H[1-6]$/) || prev.tagName === 'P' || 
            prev.tagName === 'LABEL' || prev.tagName === 'DIV') {
          const text = prev.textContent.trim();
          if (text) {
            labelText = text;
            break;
          }
        }
      }
    }
    
    // Method 6: Fallback to name attribute
    if (!labelText && input.name) {
      labelText = input.name.replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .replace(/-/g, ' ')
        .trim();
    }
    
    // If still no label, use a generic one
    if (!labelText) {
      labelText = `${input.type || input.tagName} field ${index + 1}`;
    }
    
    // Get position, path, and surrounding context for better identification
    const position = {
      x: input.getBoundingClientRect().left,
      y: input.getBoundingClientRect().top
    };
    const positionPath = getElementPath(input);
    const surroundingContext = getSurroundingText(input);
    
    // Create the form element object
    const formElement = {
      type: input.type || input.tagName.toLowerCase(),
      id: elementId,
      name: input.name || '',
      label: labelText,
      element: input,
      position: position,
      positionPath: positionPath,
      surroundingContext: surroundingContext
    };
    
    // Add special properties for different input types
    if (input.tagName === 'SELECT') {
      const selectOptions = Array.from(input.options).map(option => ({
        value: option.value,
        text: option.textContent
      }));
      formElement.options = selectOptions;
      formElement.possibleValues = selectOptions; // Add possibleValues for select elements
    } else if (input.type === 'checkbox') {
      formElement.checked = input.checked;
      // Add possible values for checkbox (true/false)
      formElement.possibleValues = [
        { value: true, text: 'Yes/Checked' },
        { value: false, text: 'No/Unchecked' }
      ];
    } else {
      // For text inputs, we can suggest that any text is possible
      formElement.possibleValues = [{ value: "", text: "Text input - any value possible" }];
    }
    
    // Get current value if any
    if (input.value && input.type !== 'checkbox' && input.type !== 'radio') {
      formElement.value = input.value;
    }
    
    formElements.push(formElement);
  });
  
  debugLog(`Found total of ${formElements.length} form elements (including ${radioGroups.size} traditional radio groups, ${ariaRadioGroups.size} ARIA radio groups, and other custom groups)`);
  
  // Debug log the structure of each form element to help diagnose issues
  formElements.forEach((el, idx) => {
    debugLog(`Form element ${idx+1}: type=${el.type}, label=${el.label}, possibleValues=${el.possibleValues ? el.possibleValues.length : 0} options`);
  });
  
  return formElements;
}

// Helper function to find a common container for radio buttons
function findCommonContainer(elements) {
  if (!elements || elements.length === 0) return null;
  if (elements.length === 1) return elements[0].parentElement;
  
  // Start with the first element's parent
  let container = elements[0].parentElement;
  
  // Go up the DOM tree until we find a container that contains all elements
  while (container && container !== document.body) {
    let containsAll = true;
    
    for (let i = 1; i < elements.length; i++) {
      if (!container.contains(elements[i])) {
        containsAll = false;
        break;
      }
    }
    
    if (containsAll) {
      return container;
    }
    
    container = container.parentElement;
  }
  
  return null;
}

// Helper function to get a CSS-like path to the element
function getElementPath(element) {
  let path = [];
  let current = element;
  
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    
    // Add ID if it exists
    if (current.id) {
      selector += `#${current.id}`;
    } 
    // Otherwise add classes
    else if (current.className) {
      const classes = Array.from(current.classList).join('.');
      if (classes) {
        selector += `.${classes}`;
      }
    }
    
    // Add position among siblings
    const siblings = Array.from(current.parentNode.children);
    const index = siblings.indexOf(current) + 1;
    if (siblings.length > 1) {
      selector += `:nth-child(${index})`;
    }
    
    path.unshift(selector);
    current = current.parentNode;
    
    // Limit path length
    if (path.length >= 4) break;
  }
  
  return path.join(' > ');
}

// Helper function to get surrounding text near an element
function getSurroundingText(element) {
  // Try to get the surrounding paragraph or container
  let container = element.parentElement;
  let depth = 0;
  const maxDepth = 3;
  
  while (container && depth < maxDepth) {
    // If this is a substantial container, use its text
    if (['p', 'div', 'section', 'fieldset', 'form'].includes(container.tagName.toLowerCase())) {
      const clone = container.cloneNode(true);
      
      // Remove scripts, inputs, etc.
      ['script', 'style', 'input', 'select', 'button', 'textarea'].forEach(tag => {
        Array.from(clone.querySelectorAll(tag)).forEach(el => el.remove());
      });
      
      const text = clone.textContent.trim();
      if (text.length > 10 && text.length < 200) {  // Reasonable length for context
        return text;
      }
    }
    
    container = container.parentElement;
    depth++;
  }
  
  // If we couldn't find a good container, get nearby text nodes
  const range = 100; // Look within 100px
  const rect = element.getBoundingClientRect();
  const nearbyElements = document.elementsFromPoint(rect.left, rect.top - 20);
  
  for (const nearby of nearbyElements) {
    if (nearby !== element && nearby.textContent) {
      const text = nearby.textContent.trim();
      if (text.length > 0 && text.length < 100) {
        return text;
      }
    }
  }
  
  return '';
}

// Function to sync knowledge base data from other tabs
function syncKnowledgeBaseData() {
  return new Promise((resolve) => {
    // Check if we need to sync data from the knowledge-base.html page
    // This ensures we have the latest data from any open knowledge base tabs
    try {
      // Send a message to all tabs to request the latest knowledge base data
      chrome.runtime.sendMessage({
        action: 'requestKnowledgeBaseData'
      }, response => {
        if (chrome.runtime.lastError) {
          console.error("Error requesting knowledge base data:", chrome.runtime.lastError);
          // Resolve with the current data even if there's an error
          resolve(JSON.parse(localStorage.getItem('deiKnowledgeBase') || '[]'));
          return;
        }
        
        if (response && response.success && response.knowledgeItems) {
          debugLog(`Received ${response.knowledgeItems.length} knowledge items from sync`);
          
          // Update localStorage with the latest data
          localStorage.setItem('deiKnowledgeBase', JSON.stringify(response.knowledgeItems));
          debugLog("Knowledge base data synced successfully");
          resolve(response.knowledgeItems);
        } else if (response && response.error) {
          debugLog("Knowledge base sync error:", response.error);
          // Resolve with the current data
          resolve(JSON.parse(localStorage.getItem('deiKnowledgeBase') || '[]'));
        } else {
          // Resolve with the current data
          resolve(JSON.parse(localStorage.getItem('deiKnowledgeBase') || '[]'));
        }
      });
    } catch (error) {
      console.error("Error syncing knowledge base data:", error);
      // Resolve with the current data
      resolve(JSON.parse(localStorage.getItem('deiKnowledgeBase') || '[]'));
    }
  });
}

// Function to send form data to backend
async function sendFormDataToBackend(formElements) {
  try {
    debugLog("Sending form data to backend");
    
    // Sync knowledge base data from other tabs first and wait for the result
    const knowledgeItems = await syncKnowledgeBaseData();
    debugLog("After sync, knowledge items count:", knowledgeItems.length);
    
    // Prepare data to send - include the enhanced information but remove DOM elements
    const formData = formElements.map(element => {
      // Don't send the DOM element
      const { element: domElement, ...rest } = element;
      
      // Keep important fields for identification
      return {
        ...rest,
        // Include specific fields that help identify duplicates
        id: element.id || '',
        name: element.name || '',
        type: element.type || 'text',
        label: element.label || '',
        position: element.position,
        positionPath: element.positionPath,
        surroundingContext: element.surroundingContext?.substring(0, 100), // Limit context size
        possibleValues: element.possibleValues || []
      };
    });
    
    // Format user data nicely as a structured document
    let userData = '';
    if (knowledgeItems.length > 0) {
      userData = "My Personal Information:\n\n";
      knowledgeItems.forEach((item, index) => {
        userData += `${index + 1}. ${item.text}\n`;
      });
    } else {
      userData = "No personal information provided.";
    }
    
    // Debug log what we're sending
    debugLog("Form data being sent:", formData);
    debugLog("User data being sent:", userData);
    
    // Show processing toast
    showToast(`Processing ${formData.length} form elements...`, 3000);
    
    // Send data to backend
    const response = await fetch('http://127.0.0.1:5001/fill-form', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        form_data: formData,
        user_data: userData
      })
    });
    
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status === 'success' && data.form_answers) {
      // Fill the form with the received answers
      fillFormWithAnswers(data.form_answers, formElements);
      showToast('Form filled successfully', 3000);
    } else {
      showToast('Could not generate form answers', 3000);
    }
    
  } catch (error) {
    console.error("Error filling form:", error);
    showToast(`Error: ${error.message}`, 3000);
  }
}

// Function to fill form with answers
function fillFormWithAnswers(answers, formElements) {
  debugLog("Filling form with answers", answers);
  
  answers.forEach(answer => {
    // Make sure we have valid data before proceeding
    if (!answer) {
      debugLog("Received undefined or null answer object");
      return;
    }
    
    // Ensure question exists and is a string
    const question = (answer.question || "").toString();
    const htmlId = (answer.html_id || "").toString();
    const answerValue = (answer.answer !== undefined && answer.answer !== null) 
                        ? answer.answer 
                        : "";
    
    debugLog(`Processing answer for question: "${question}", value: "${answerValue}"`);
    
    // Find the corresponding form element by id or label
    const elementInfo = formElements.find(el => {
      // Check for matching ID
      if (el.id && htmlId && el.id === htmlId) {
        return true;
      }
      
      // Check for matching label
      if (el.label && question) {
        const elLabel = el.label.toString().toLowerCase();
        const q = question.toLowerCase();
        if (elLabel.includes(q)) {
          return true;
        }
      }
      
      // Check for matching name
      if (el.name && htmlId && el.name === htmlId) {
        return true;
      }
      
      return false;
    });
    
    if (!elementInfo) {
      debugLog(`Could not find element for answer: ${question}`);
      // Try a more fuzzy match on the question text
      const fuzzyMatch = formElements.find(el => {
        if (el.label && question) {
          const elLabel = el.label.toString().toLowerCase();
          const q = question.toLowerCase();
          if (q.includes(elLabel)) {
            return true;
          }
        }
        
        if (el.surroundingContext && question) {
          const context = el.surroundingContext.toString().toLowerCase();
          const q = question.toLowerCase();
          if (context.includes(q)) {
            return true;
          }
        }
        
        return false;
      });
      
      if (fuzzyMatch) {
        debugLog(`Found fuzzy match for answer: "${question}" -> "${fuzzyMatch.label}"`);
        fillElement(fuzzyMatch, answerValue);
      } else {
        debugLog(`No matches found for answer: "${question}"`);
      }
      return;
    }
    
    fillElement(elementInfo, answerValue);
  });
  
  // Helper function to fill an element based on its type
  function fillElement(elementInfo, answerValue) {
    if (!elementInfo) {
      debugLog("Cannot fill undefined element");
      return;
    }
    
    // Convert answerValue to string if it's not already
    const answer = (answerValue !== undefined && answerValue !== null) ? answerValue : "";
    
    debugLog(`Filling element: type=${elementInfo.type}, label="${elementInfo.label || ''}", answer="${answer}"`);
    
    // Handle different types of inputs
    switch (elementInfo.type) {
      case 'radio_group': // New format from our enhanced parser
        handleRadioGroup(elementInfo, answer);
        break;
        
      case 'radio-group': // Legacy format for backward compatibility
        handleRadioGroup(elementInfo, answer);
        break;
        
      case 'checkbox':
        // Check if answer is truthy
        const isChecked = answer === true || 
                         answer === 'true' || 
                         answer === 'yes' || 
                         answer === 'checked';
        elementInfo.element.checked = isChecked;
        triggerEvent(elementInfo.element, 'change');
        triggerEvent(elementInfo.element, 'click');
        break;
        
      case 'select-one':
      case 'select':
        // Find option with matching value or text
        const select = elementInfo.element;
        const options = Array.from(select.options);
        let matchFound = false;
        
        for (let i = 0; i < options.length; i++) {
          const option = options[i];
          const optionValue = (option.value || "").toString().toLowerCase();
          const optionText = (option.text || "").toString().toLowerCase();
          const answerLower = answer.toString().toLowerCase();
          
          if (optionValue === answerLower || 
              optionValue.includes(answerLower) ||
              optionText.includes(answerLower) || 
              answerLower.includes(optionText)) {
            select.selectedIndex = i;
            triggerEvent(select, 'change');
            matchFound = true;
            break;
          }
        }
        
        if (!matchFound) {
          debugLog(`Could not find matching option for select: ${answer}`);
        }
        break;
        
      default:
        // Text input, textarea, etc.
        if (elementInfo.element) {
          elementInfo.element.value = answer.toString();
          triggerEvent(elementInfo.element, 'input');
        } else {
          debugLog("Element not found for filling text input");
        }
        break;
    }
  }
  
  // Helper function to handle any type of radio group
  function handleRadioGroup(elementInfo, answerValue) {
    if (!elementInfo) {
      debugLog("Cannot handle undefined radio group");
      return;
    }
    
    // Convert answerValue to string if it's not already
    const answer = (answerValue !== undefined && answerValue !== null) ? answerValue.toString() : "";
    
    debugLog(`Handling radio group: ${elementInfo.label || 'unnamed'} with answer: ${answer}`);
    
    // For standard HTML radio buttons
    if (elementInfo.name && !elementInfo.isAriaGroup && !elementInfo.isCustomGroup) {
      const radioButtons = document.querySelectorAll(`input[type="radio"][name="${elementInfo.name}"]`);
      let matched = false;
      
      radioButtons.forEach(radio => {
        const radioValue = (radio.value || "").toString().toLowerCase();
        const answerLower = answer.toLowerCase();
        
        const shouldSelect = radioValue === answerLower || 
                           radioValue.includes(answerLower) ||
                           answerLower.includes(radioValue);
                           
        if (shouldSelect) {
          debugLog(`Setting radio button checked: ${radio.value}`);
          radio.checked = true;
          triggerEvent(radio, 'change');
          triggerEvent(radio, 'click');
          matched = true;
        }
      });
      
      if (!matched) {
        debugLog(`No matching radio button found for value: ${answer}`);
      }
      return;
    }
    
    // For ARIA-based radio buttons (like Google Forms)
    if (elementInfo.isAriaGroup) {
      const options = elementInfo.options || elementInfo.possibleValues || [];
      let targetOption = null;
      let targetButton = null;
      
      // Find the option that matches the answer
      for (const option of options) {
        if (!option) continue;
        
        const optionValue = (option.value || "").toString().toLowerCase();
        const optionText = (option.text || "").toString().toLowerCase();
        const answerLower = answer.toLowerCase();
        
        if (optionValue === answerLower || 
            optionValue.includes(answerLower) ||
            optionText.includes(answerLower) || 
            answerLower.includes(optionText)) {
          targetOption = option;
          break;
        }
      }
      
      if (!targetOption) {
        debugLog(`No matching option found for ARIA radio group: ${answer}`);
        return;
      }
      
      // Find the button that corresponds to this option
      const container = elementInfo.element?.closest('[role="radiogroup"]');
      if (!container) {
        debugLog(`Could not find radiogroup container`);
        return;
      }
      
      const radioButtons = Array.from(container.querySelectorAll('[role="radio"]'));
      
      for (const button of radioButtons) {
        if (!button) continue;
        
        const ariaLabel = button.getAttribute('aria-label') || "";
        const dataValue = button.getAttribute('data-value') || "";
        const buttonText = ariaLabel || dataValue || button.textContent.trim() || "";
        const targetText = targetOption.text || "";
        
        if (buttonText === targetText || 
            buttonText.includes(targetText) ||
            targetText.includes(buttonText)) {
          targetButton = button;
          break;
        }
      }
      
      if (targetButton) {
        debugLog(`Clicking ARIA radio button: ${targetOption.text}`);
        
        // For Google Forms, we need to click the button
        targetButton.click();
        
        // Also set ARIA attributes
        radioButtons.forEach(btn => {
          if (!btn) return;
          btn.setAttribute('aria-checked', btn === targetButton ? 'true' : 'false');
          if (btn === targetButton) {
            btn.focus();
          }
        });
        
        // Dispatch events
        triggerEvent(targetButton, 'change');
      } else {
        debugLog(`Could not find matching ARIA radio button for: ${targetOption.text}`);
      }
      return;
    }
    
    // For custom implementations
    if (elementInfo.isCustomGroup) {
      const options = elementInfo.options || elementInfo.possibleValues || [];
      let targetOption = null;
      
      // Find the option that matches the answer
      for (const option of options) {
        if (!option) continue;
        
        const optionValue = (option.value || "").toString().toLowerCase();
        const optionText = (option.text || "").toString().toLowerCase();
        const answerLower = answer.toLowerCase();
        
        if (optionValue === answerLower || 
            optionValue.includes(answerLower) ||
            optionText.includes(answerLower) || 
            answerLower.includes(optionText)) {
          targetOption = option;
          break;
        }
      }
      
      if (!targetOption) {
        debugLog(`No matching option found for custom group: ${answer}`);
        return;
      }
      
      // Try to find the corresponding element to click
      const container = elementInfo.element;
      if (!container) {
        debugLog("Custom group container not found");
        return;
      }
      
      const elements = container.querySelectorAll('.option, .choice, .radio, li, [role="option"], [role="menuitem"]');
      
      let targetElement = null;
      for (const element of elements) {
        if (!element) continue;
        
        const elementText = element.textContent.trim() || "";
        const targetText = targetOption.text || "";
        
        if (elementText === targetText || 
            elementText.includes(targetText) ||
            targetText.includes(elementText)) {
          targetElement = element;
          break;
        }
      }
      
      if (targetElement) {
        debugLog(`Clicking custom radio option: ${targetOption.text}`);
        targetElement.click();
      } else {
        debugLog(`Could not find matching custom radio element for: ${targetOption.text}`);
      }
    }
  }
}

// Function to trigger events
function triggerEvent(element, eventType) {
  if (!element) {
    debugLog(`Cannot trigger ${eventType} event on undefined element`);
    return;
  }
  
  try {
    const event = new Event(eventType, { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
  } catch (error) {
    debugLog(`Error triggering ${eventType} event: ${error.message}`);
  }
}

//-------------------------------------------------------------------
// Knowledge Base Sync
//-------------------------------------------------------------------

// Add message listener for knowledge base updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateKnowledgeBase" && request.knowledgeItems) {
    debugLog(`Received knowledge base update with ${request.knowledgeItems.length} items`);
    
    // Update the localStorage with the new data
    localStorage.setItem('deiKnowledgeBase', JSON.stringify(request.knowledgeItems));
    
    // If we have the knowledge base modal open, refresh it
    if (document.getElementById('deiKnowledgeModal')) {
      displayKnowledgeItems();
    }
    
    sendResponse({ success: true });
  }
  return true;
});

// Function to sync knowledge base data from other tabs

