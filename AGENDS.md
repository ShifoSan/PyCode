# AGENDS.md: Web Pydroid Clone - Current State

## 1. Project Overview
A single-page, mobile-first web application designed to mimic the UI and core functionality of the "Pydroid 3" Android IDE. It allows users to write Python code, execute it entirely in the browser, and use an integrated AI assistant to check for bugs and suggest fixes.

## 2. Tech Stack
* **Frontend:** Vanilla HTML, CSS, JavaScript.
* **Editor:** CodeMirror 5 (Python mode, Monokai theme).
* **Execution Environment:** Pyodide (WebAssembly Python).
* **AI Integration:** Google Gemini REST API (`gemini-3.1-flash-lite-preview`).
* **Assets:** FontAwesome (Icons).

## 3. Architecture & File Breakdown

### `index.html`
* **Main Views:** Uses a `.view` toggling system to switch between `#editor-view` (active by default) and `#terminal-view`.
* **Top Bar:** Contains a mock hamburger menu, file name indicator (`new*`), an API key password input, and an AI Check magic wand button.
* **Editor Area:** A `<textarea>` container for CodeMirror.
* **Run Button:** A Floating Action Button (FAB) in the bottom right.
* **AI Modal (`#ai-modal`):** An overlay with three distinct, toggleable states:
    1.  Loading spinner.
    2.  Results view (Status, Explanation, "Let AI Fix It" button).
    3.  Preview view (Code diff preview, Accept/Cancel buttons).

### `style.css`
* **Theme:** Deep dark mode mimicking native Pydroid (`#000000` background, `#1a2a3a` top bar, `#272822` editor).
* **Layout:** Uses Flexbox extensively to manage the viewport height (`100vh`) and prevent mobile pull-to-refresh bouncing (`overscroll-behavior: none`).
* **Terminal:** Styled to wrap text (`white-space: pre-wrap`) and look like a standard console.
* **Modals:** Centralized pop-up with clean, app-like buttons (Primary, Success, Secondary).

### `script.js`
* **CodeMirror Initialization:** Set up with line numbers, indentation, and the Python language mode.
* **Pyodide Initialization:** Loads asynchronously. 
    * `stdout` and `stderr` are mapped to append text to the `#terminal-output` div and auto-scroll to the bottom.
    * *Current state of `stdin`:* Currently relying on a basic `window.prompt()`.
* **View Switching:** The Run button hides the editor, clears the terminal, and executes `pyodideInstance.runPythonAsync(code)`. The Back button reverses this and refreshes the CodeMirror instance.
* **AI Logic:**
    * Validates that an API key is present and the editor isn't empty.
    * Calls the Gemini REST API using `fetch`.
    * Prompts the model to return a strict JSON object (`status`, `explanation`, `fixedCode`).
    * Handles UI state transitions for the modal (Loading -> Results -> Preview).
    * If "Accept" is clicked, it overwrites the CodeMirror editor using `editor.setValue()`.

## 4. Known Issues / Immediate Next Steps
* **The `window.prompt()` Blocking Bug:** When Python executes an `input("prompt text")` call, Pyodide sends the prompt text to `stdout`, but the main thread immediately blocks for the `window.prompt()`. This freezes the DOM before the terminal can render the text, resulting in the user seeing a blank browser prompt without knowing what to type. *Fix pending: Override built-in Python `input` function.*
