/**
 * featureGuard.js
 *
 * Intercepts user queries that reference features outside AskiFy's scope.
 * Returns a structured response object so the caller can inject an
 * assistant message immediately — no API round-trip required.
 */

/**
 * @typedef {Object} UnsupportedFeature
 * @property {string}   id          - Unique feature identifier
 * @property {string}   label       - Human-friendly feature name shown to user
 * @property {string[]} triggers    - Lowercase keyword fragments to match
 * @property {string}   priority    - What AskiFy focuses on instead
 * @property {string}   alternative - Practical next step for the user
 */

/** @type {UnsupportedFeature[]} */
const UNSUPPORTED_FEATURES = [
  {
    id: 'video_generation',
    label: 'Video Generation',
    triggers: [
      'generate video', 'create video', 'make video', 'produce video',
      'video generation', 'ai video', 'text to video', 'video from text',
      'render video', 'animate video', 'video synthesis',
    ],
    priority: 'high-fidelity academic Q&A and document analysis',
    alternative: 'vote for this feature in our roadmap or provide more details on your use case',
  },
  {
    id: 'image_generation',
    label: 'Image Generation',
    triggers: [
      'generate image', 'create image', 'make image', 'draw ', 'paint ',
      'image generation', 'ai art', 'text to image', 'dall-e', 'stable diffusion',
      'midjourney', 'generate a picture', 'create a picture', 'render image',
      'generate art', 'illustrate',
    ],
    priority: 'deep document processing and structured study assistance',
    alternative: 'track our progress on the roadmap or share how you\'d use this for studying',
  },
  {
    id: 'audio_generation',
    label: 'Audio / Music Generation',
    triggers: [
      'generate audio', 'create audio', 'generate music', 'compose music',
      'text to speech', 'tts', 'make music', 'audio generation',
      'voice synthesis', 'ai music', 'suno', 'udio',
    ],
    priority: 'text-based academic support',
    alternative: 'suggest this as a priority in our feedback forum',
  },
  {
    id: 'web_browsing',
    label: 'Live Web Browsing',
    triggers: [
      'browse the web', 'search the internet', 'look up online', 'check the web',
      'fetch url', 'scrape website', 'visit website', 'open url', 'web search',
      'latest news', 'check news', 'current events', 'real-time search',
    ],
    priority: 'extracting intelligence from your uploaded materials',
    alternative: 'upload the content as a document so I can help you analyze it directly',
  },
  {
    id: 'code_execution',
    label: 'Code Execution',
    triggers: [
      'run this code', 'execute this', 'run the program', 'compile and run',
      'execute code', 'run script', 'run python', 'run javascript',
      'execute my code', 'run it', 'test this code live',
    ],
    priority: 'logical code analysis, debugging, and generation',
    alternative: 'use a specialized environment like Replit for live execution',
  },
  {
    id: 'file_download',
    label: 'File Export / Download',
    triggers: [
      'download this', 'export as pdf', 'export to word', 'save as file',
      'generate pdf', 'create a pdf', 'export document', 'download pdf',
      'save to file', 'export report',
    ],
    priority: 'real-time responses you can instantly copy and use',
    alternative: 'copy the text directly or let us know which formats you need most',
  },
  {
    id: 'image_editing',
    label: 'Image Editing',
    triggers: [
      'edit image', 'edit this image', 'modify image', 'resize image',
      'crop image', 'enhance image', 'remove background', 'upscale image',
      'image editing', 'photoshop', 'retouch',
    ],
    priority: 'academic tutoring and knowledge extraction',
    alternative: 'submit feedback if visual processing is essential for your workflow',
  },
  {
    id: 'translation',
    label: 'Full Document Translation',
    triggers: [
      'translate this document', 'translate the whole file', 'translate entire pdf',
      'translate this pdf', 'translate my document', 'full translation',
    ],
    priority: 'context-aware analysis of your uploaded content',
    alternative: 'paste specific sections for translation or vote for full-file support',
  },
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the assistant message text for an unsupported feature.
 * @param {UnsupportedFeature} feature
 * @returns {string}
 */
function buildMessage(feature) {
  return (
    `Thank you for the suggestion. We currently don’t support **${feature.label}**. ` +
    `We’re focusing on ${feature.priority}, but we value your input. ` +
    `If you’d like, you can ${feature.alternative}.`
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a query references an unsupported feature.
 *
 * @param {string} query - Raw user input (pre-trim is fine)
 * @returns {{ detected: false } | { detected: true, feature: UnsupportedFeature, message: string }}
 */
export function checkUnsupportedFeature(query) {
  const lower = query.toLowerCase();

  for (const feature of UNSUPPORTED_FEATURES) {
    if (feature.triggers.some((t) => lower.includes(t))) {
      return {
        detected: true,
        feature,
        message: buildMessage(feature),
      };
    }
  }

  return { detected: false };
}

/**
 * Convenience: resolve the label for a feature ID.
 * @param {string} id
 * @returns {string}
 */
export function getFeatureLabel(id) {
  return UNSUPPORTED_FEATURES.find((f) => f.id === id)?.label ?? id;
}

/**
 * Full registry — exposed so UI components can render an "unsupported features" list.
 * @returns {UnsupportedFeature[]}
 */
export function getUnsupportedFeatures() {
  return UNSUPPORTED_FEATURES;
}
