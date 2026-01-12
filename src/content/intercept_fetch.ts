// Fetch/XHR interception for submission detection (fallback method)

interface InterceptedSubmission {
  slug?: string;
  code?: string;
  language?: string;
  verdict?: string;
  runtime?: string;
  memory?: string;
}

type SubmissionCallback = (submission: InterceptedSubmission) => void;

let submissionCallback: SubmissionCallback | null = null;
let isInterceptorInjected = false;

/**
 * Set the callback for intercepted submissions
 */
export function setSubmissionInterceptCallback(callback: SubmissionCallback): void {
  submissionCallback = callback;
}

/**
 * Inject the fetch/XHR interceptor into the page context
 */
export function injectInterceptor(): void {
  if (isInterceptorInjected) return;
  
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      const INTERCEPT_PATTERNS = [
        /\\/api\\/.*submit/i,
        /\\/api\\/.*run/i,
        /\\/api\\/.*judge/i,
        /\\/submit/i,
        /\\/run/i,
      ];
      
      function shouldIntercept(url) {
        return INTERCEPT_PATTERNS.some(pattern => pattern.test(url));
      }
      
      function parseSubmissionData(body) {
        if (!body) return null;
        
        try {
          let data;
          if (typeof body === 'string') {
            data = JSON.parse(body);
          } else if (body instanceof FormData) {
            data = {};
            for (const [key, value] of body.entries()) {
              data[key] = value;
            }
          } else {
            data = body;
          }
          
          // Look for code and language
          const code = data.code || data.source || data.solution || data.typed_code;
          const language = data.language || data.lang || data.language_id;
          const slug = data.slug || data.problem_slug || data.problem_id || data.titleSlug;
          
          if (code || slug) {
            return { code, language, slug };
          }
        } catch (e) {
          // Not JSON, ignore
        }
        
        return null;
      }
      
      function parseVerdictData(response) {
        if (!response) return null;
        
        try {
          const data = typeof response === 'string' ? JSON.parse(response) : response;
          
          const verdict = data.status || data.verdict || data.result || data.status_msg;
          const runtime = data.runtime || data.status_runtime || data.time;
          const memory = data.memory || data.status_memory || data.space;
          
          return { verdict, runtime, memory };
        } catch (e) {
          // Not JSON, ignore
        }
        
        return null;
      }
      
      function dispatchSubmissionEvent(data) {
        document.dispatchEvent(new CustomEvent('neetsync-intercepted-submission', {
          detail: data
        }));
      }
      
      // Intercept fetch
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        const [resource, config] = args;
        const url = typeof resource === 'string' ? resource : resource.url;
        
        if (shouldIntercept(url)) {
          const submissionData = parseSubmissionData(config?.body);
          
          try {
            const response = await originalFetch.apply(this, args);
            const clonedResponse = response.clone();
            
            clonedResponse.text().then(text => {
              const verdictData = parseVerdictData(text);
              
              if (submissionData || verdictData) {
                dispatchSubmissionEvent({
                  ...submissionData,
                  ...verdictData,
                  url,
                  method: 'fetch'
                });
              }
            }).catch(() => {});
            
            return response;
          } catch (error) {
            throw error;
          }
        }
        
        return originalFetch.apply(this, args);
      };
      
      // Intercept XMLHttpRequest
      const originalXHROpen = XMLHttpRequest.prototype.open;
      const originalXHRSend = XMLHttpRequest.prototype.send;
      
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._neetsyncUrl = url;
        this._neetsyncMethod = method;
        return originalXHROpen.apply(this, [method, url, ...rest]);
      };
      
      XMLHttpRequest.prototype.send = function(body) {
        const url = this._neetsyncUrl;
        
        if (url && shouldIntercept(url)) {
          const submissionData = parseSubmissionData(body);
          
          this.addEventListener('load', function() {
            const verdictData = parseVerdictData(this.responseText);
            
            if (submissionData || verdictData) {
              dispatchSubmissionEvent({
                ...submissionData,
                ...verdictData,
                url,
                method: 'xhr'
              });
            }
          });
        }
        
        return originalXHRSend.apply(this, [body]);
      };
      
      console.log('[NeetSync] Fetch/XHR interceptor installed');
    })();
  `;
  
  document.documentElement.appendChild(script);
  script.remove();
  
  // Listen for intercepted submissions
  document.addEventListener('neetsync-intercepted-submission', ((event: CustomEvent) => {
    if (submissionCallback) {
      submissionCallback(event.detail);
    }
  }) as EventListener);
  
  isInterceptorInjected = true;
  console.log('[NeetSync] Interceptor injected');
}

/**
 * Check if a verdict indicates acceptance
 */
export function isAcceptedVerdict(verdict: string | undefined): boolean {
  if (!verdict) return false;
  
  const lower = verdict.toLowerCase();
  return (
    lower.includes('accepted') ||
    lower.includes('success') ||
    lower.includes('passed') ||
    lower === 'ac'
  );
}
