document.addEventListener('DOMContentLoaded', async () => {
    // === DOM Elements ===
    const editorView = document.getElementById('editor-view');
    const terminalView = document.getElementById('terminal-view');
    const terminalOutput = document.getElementById('terminal-output');

    const runBtn = document.getElementById('run-btn');
    const backBtn = document.getElementById('back-to-editor-btn');
    const aiCheckBtn = document.getElementById('ai-check-btn');
    const apiKeyInput = document.getElementById('api-key-input');

    // Modal Elements
    const aiModal = document.getElementById('ai-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const aiLoading = document.getElementById('ai-loading');
    const aiResults = document.getElementById('ai-results');
    const aiPreview = document.getElementById('ai-preview');
    const aiStatus = document.getElementById('ai-status');
    const aiExplanation = document.getElementById('ai-explanation');
    const aiFixedCode = document.getElementById('ai-fixed-code');
    const letAiFixBtn = document.getElementById('let-ai-fix-btn');
    const acceptFixBtn = document.getElementById('accept-fix-btn');
    const cancelFixBtn = document.getElementById('cancel-fix-btn');

    // State
    let pyodideReady = false;
    let pyodideInstance = null;
    let proposedFix = "";

    // === Initialize CodeMirror ===
    const editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
        mode: {
            name: "python",
            version: 3,
            singleLineStringErrors: false
        },
        theme: "monokai",
        lineNumbers: true,
        indentUnit: 4,
        matchBrackets: true,
        viewportMargin: Infinity // Ensure it scrolls smoothly
    });

    // Force refresh to handle possible sizing issues on mobile load
    setTimeout(() => editor.refresh(), 100);

    // === Initialize Pyodide ===
    async function initPyodide() {
        try {
            // Load Pyodide script
            pyodideInstance = await loadPyodide({
                stdin: () => {
                    return window.prompt() || "";
                },
                stdout: (text) => {
                    terminalOutput.textContent += text + '\n';
                    // Auto-scroll terminal
                    terminalOutput.scrollTop = terminalOutput.scrollHeight;
                },
                stderr: (text) => {
                    terminalOutput.textContent += text + '\n';
                    terminalOutput.scrollTop = terminalOutput.scrollHeight;
                }
            });

            // Override built-in input() to show a browser prompt
            await pyodideInstance.runPythonAsync(`
                import builtins
                import js

                def custom_input(prompt_text=''):
                    return js.prompt(prompt_text) or ""

                builtins.input = custom_input
            `);

            pyodideReady = true;
            console.log("Pyodide loaded successfully");
        } catch (err) {
            console.error("Pyodide failed to load", err);
            terminalOutput.textContent += "Error: Failed to load Python environment.\n";
        }
    }

    // Start loading in the background
    initPyodide();

    // === Event Listeners: Navigation ===
    runBtn.addEventListener('click', async () => {
        // Switch to terminal view
        editorView.classList.remove('active');
        terminalView.classList.add('active');

        // Clear previous output
        terminalOutput.textContent = "";

        if (!pyodideReady) {
            terminalOutput.textContent = "Python environment is still loading. Please wait...\n";
            return;
        }

        const code = editor.getValue();

        try {
            await pyodideInstance.runPythonAsync(code);
            terminalOutput.textContent += "\n[Program finished]";
        } catch (err) {
            // Output Python errors
            terminalOutput.textContent += `\n${err.message}`;
        }
    });

    backBtn.addEventListener('click', () => {
        // Switch back to editor view
        terminalView.classList.remove('active');
        editorView.classList.add('active');
        editor.refresh(); // Important after returning from hidden state
    });

    // === Event Listeners: AI Feature ===

    // Helper to switch modal states
    function setModalState(state) {
        aiLoading.classList.add('hidden');
        aiResults.classList.add('hidden');
        aiPreview.classList.add('hidden');

        if (state === 'loading') aiLoading.classList.remove('hidden');
        else if (state === 'results') aiResults.classList.remove('hidden');
        else if (state === 'preview') aiPreview.classList.remove('hidden');
    }

    function closeModal() {
        aiModal.classList.add('hidden');
        proposedFix = "";
    }

    closeModalBtn.addEventListener('click', closeModal);
    cancelFixBtn.addEventListener('click', closeModal);

    aiCheckBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        const code = editor.getValue();

        if (!apiKey) {
            alert("Please enter your Gemini API Key first.");
            return;
        }
        if (!code.trim()) {
            alert("Editor is empty. Write some code first!");
            return;
        }

        // Open Modal and show loading
        aiModal.classList.remove('hidden');
        setModalState('loading');

        try {
            // Call Gemini API
            const response = await callGeminiAPI(apiKey, code);

            if (response.error) {
                throw new Error(response.error);
            }

            // Populate results
            aiStatus.textContent = response.status || "Analysis Complete";
            aiExplanation.textContent = response.explanation || "No explanation provided.";
            proposedFix = response.fixedCode || code;

            // Ensure fix button is visible on success
            letAiFixBtn.style.display = 'block';

            setModalState('results');

        } catch (err) {
            console.error(err);
            aiStatus.textContent = "Error";
            aiExplanation.textContent = err.message || "Failed to connect to the AI service.";
            // Hide the 'Fix It' button on error
            letAiFixBtn.style.display = 'none';
            setModalState('results');
        }
    });

    letAiFixBtn.addEventListener('click', () => {
        // Show the preview
        aiFixedCode.textContent = proposedFix;
        setModalState('preview');
    });

    acceptFixBtn.addEventListener('click', () => {
        // Replace editor content
        editor.setValue(proposedFix);
        closeModal();
    });

    // === API Calling Logic ===
    async function callGeminiAPI(apiKey, code) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`;

        const promptText = `
        Analyze the following Python code for any syntax or logical errors, or potential improvements.
        Return the result strictly as a JSON object with three keys:
        - "status": A short summary (e.g., "Looks good!", "Found some bugs", "Syntax Error").
        - "explanation": A brief explanation of the issues and how to fix them.
        - "fixedCode": The complete, corrected Python code. If no changes are needed, return the original code.

        Do not use markdown code blocks like \`\`\`json around the response, return only raw JSON.

        Code to analyze:
        ${code}
        `;

        const requestBody = {
            contents: [{
                parts: [{ text: promptText }]
            }],
            generationConfig: {
                // Ensure the model knows we want JSON (for models that support it natively, otherwise prompt is sufficient)
                responseMimeType: "application/json"
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || `API Error: ${response.status}`);
        }

        const data = await response.json();

        // Extract text from Gemini response
        let textResponse = data.candidates[0].content.parts[0].text;

        // Safety cleanup just in case the model returns markdown wrapper despite instructions
        textResponse = textResponse.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

        return JSON.parse(textResponse);
    }
});
