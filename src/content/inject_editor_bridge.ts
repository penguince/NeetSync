// Injected script to bridge with Monaco/CodeMirror editor
// This runs in the page context, not content script context

(function () {
  const BRIDGE_ID = 'neetsync-editor-bridge';
  
  // Prevent duplicate injection
  if (document.getElementById(BRIDGE_ID)) {
    return;
  }
  
  // Create bridge element
  const bridge = document.createElement('div');
  bridge.id = BRIDGE_ID;
  bridge.style.display = 'none';
  document.body.appendChild(bridge);
  
  /**
   * Get code from Monaco editor
   */
  function getMonacoCode(): string | null {
    try {
      // Method 1: Global monaco instance
      if (typeof (window as any).monaco !== 'undefined') {
        const monaco = (window as any).monaco;
        const editors = monaco.editor.getEditors?.() || [];
        
        if (editors.length > 0) {
          return editors[0].getValue();
        }
        
        // Try getting from models
        const models = monaco.editor.getModels?.() || [];
        if (models.length > 0) {
          return models[0].getValue();
        }
      }
      
      // Method 2: Look for Monaco in window properties
      for (const key of Object.keys(window)) {
        const obj = (window as any)[key];
        if (obj && typeof obj === 'object' && obj.editor && typeof obj.editor.getEditors === 'function') {
          const editors = obj.editor.getEditors();
          if (editors.length > 0) {
            return editors[0].getValue();
          }
        }
      }
      
      // Method 3: React fiber approach
      const editorElement = document.querySelector('.monaco-editor');
      if (editorElement) {
        const reactKey = Object.keys(editorElement).find(
          (key) => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
        );
        if (reactKey) {
          let fiber = (editorElement as any)[reactKey];
          while (fiber) {
            if (fiber.memoizedProps?.value !== undefined) {
              return fiber.memoizedProps.value;
            }
            if (fiber.stateNode?.editor?.getValue) {
              return fiber.stateNode.editor.getValue();
            }
            fiber = fiber.return;
          }
        }
      }
    } catch (e) {
      console.error('[NeetSync Bridge] Monaco extraction error:', e);
    }
    
    return null;
  }
  
  /**
   * Get code from CodeMirror editor
   */
  function getCodeMirrorCode(): string | null {
    try {
      // CodeMirror 6
      const cm6Editor = document.querySelector('.cm-editor');
      if (cm6Editor) {
        const view = (cm6Editor as any).cmView?.view;
        if (view) {
          return view.state.doc.toString();
        }
      }
      
      // CodeMirror 5
      const cm5Editor = document.querySelector('.CodeMirror');
      if (cm5Editor) {
        const cm = (cm5Editor as any).CodeMirror;
        if (cm && typeof cm.getValue === 'function') {
          return cm.getValue();
        }
      }
      
      // Global CodeMirror
      if (typeof (window as any).CodeMirror !== 'undefined') {
        const instances = document.querySelectorAll('.CodeMirror');
        for (const instance of instances) {
          const cm = (instance as any).CodeMirror;
          if (cm) {
            return cm.getValue();
          }
        }
      }
    } catch (e) {
      console.error('[NeetSync Bridge] CodeMirror extraction error:', e);
    }
    
    return null;
  }
  
  /**
   * Get language from UI
   */
  function getLanguage(): string | null {
    try {
      // Look for language selector buttons/dropdowns
      const selectors = [
        'button[class*="language"] span',
        'select[class*="language"]',
        '[class*="lang"] button',
        '[class*="language-selector"]',
        '.dropdown-toggle',
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          const text = (element.textContent || '').trim().toLowerCase();
          if (text && text.length < 20) {
            return text;
          }
        }
      }
      
      // Check Monaco language
      if (typeof (window as any).monaco !== 'undefined') {
        const monaco = (window as any).monaco;
        const models = monaco.editor.getModels?.() || [];
        if (models.length > 0) {
          const lang = models[0].getLanguageId?.();
          if (lang) return lang;
        }
      }
    } catch (e) {
      console.error('[NeetSync Bridge] Language extraction error:', e);
    }
    
    return null;
  }
  
  /**
   * Main handler for extraction requests
   */
  function handleExtractionRequest(): void {
    const code = getMonacoCode() || getCodeMirrorCode();
    const language = getLanguage();
    
    // Dispatch result event
    const event = new CustomEvent('neetsync-extraction-result', {
      detail: {
        code,
        language,
        timestamp: Date.now(),
      },
    });
    
    document.dispatchEvent(event);
  }
  
  // Listen for extraction requests
  document.addEventListener('neetsync-extract-request', handleExtractionRequest);
  
  // Signal that bridge is ready
  document.dispatchEvent(new CustomEvent('neetsync-bridge-ready'));
  
  console.log('[NeetSync Bridge] Editor bridge initialized');
})();
