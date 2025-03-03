// Debug log to confirm content script is loaded
const DEBUG = true;  // Enable debugging

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
      tooltip: 'Summarize Selection',
      action: activateSummarizeMode
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
    toggleMenu(); // Close the menu
    
    // Show a fancy scanning animation
    showPageScanAnimation(() => {
      // Extract page content
      const pageContent = extractPageContent();
      
      // After animation completes, summarize the page content
      summarizePageContent(pageContent);
    });
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
