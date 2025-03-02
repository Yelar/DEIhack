document.addEventListener("DOMContentLoaded", () => {
  const recordBtn = document.getElementById("recordBtn");
  const wave = document.getElementById("wave");
  const status = document.getElementById("status");
  const transcriptEl = document.getElementById("transcript");
  const audioPlayer = document.getElementById("audioPlayer");

  let mediaRecorder;
  let audioChunks = [];
  let isRecording = false;
  let recognition;
  const backendUrl = "http://127.0.0.1:5000/transcript"; // Adjust if needed

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        // Create audio blob for playback (optional)
        const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
        const audioURL = URL.createObjectURL(audioBlob);
        audioPlayer.src = audioURL;
        audioPlayer.style.display = "block";
      };

      // Start recording audio
      mediaRecorder.start();

      // Start live transcription concurrently
      if (!("webkitSpeechRecognition" in window)) {
        transcriptEl.innerText =
          "Speech recognition not supported in this browser.";
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
        transcriptEl.innerText = `Transcript: ${finalTranscript} ${interimTranscript}`;
      };

      recognition.onerror = (event) => {
        transcriptEl.innerText = `Error: ${event.error}`;
      };

      recognition.onend = () => {
        if (finalTranscript) {
          sendTranscript(finalTranscript);
        }
      };

      recognition.start();

      isRecording = true;
      status.innerText = "Recording...";
      recordBtn.innerText = "Stop";
      recordBtn.classList.add("recording");
      wave.classList.add("active");
    } catch (error) {
      console.error("Error accessing microphone:", error);
      status.innerText =
        "Microphone access denied. Please allow access in browser settings.";
    }
  }

  function stopRecording() {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
      recordBtn.innerText = "Rec";
      recordBtn.classList.remove("recording");
      wave.classList.remove("active");
      if (recognition) {
        recognition.stop();
      }
      status.innerText = "Recording stopped";
    }
  }

  async function sendTranscript(transcript) {
    try {
      const response = await fetch(backendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const data = await response.json();
      console.log("Backend response:", data);

      if (data) {
        chrome.runtime.sendMessage({
          message: "Transcript received successfully!",
          summary: data.summary,
        });
      }
    } catch (error) {
      console.error("Error sending transcript:", error);
    }
  }

  recordBtn.addEventListener("click", async () => {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  });
});
