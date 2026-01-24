const AIPlacement = {
    isAnalyzing: false,

    // Configuration for local AI service (LM Studio / Ollama)
    config: {
        apiUrl: 'http://192.168.50.67:1234/v1/chat/completions',
        model: 'llava-v1.5-7b', // Default to standard LLaVA model name
        temperature: 0.1,
        maxTokens: 500
    },

    // Main entry point - triggered after obstacles map is finished
    analyzeProperty: async () => {
        console.log('AIPlacement.analyzeProperty called');
        if (AIPlacement.isAnalyzing) {
            console.log('AI analysis already in progress, skipping');
            return;
        }

        AIPlacement.isAnalyzing = true;
        AIPlacement.showLoadingState(true);
        AIPlacement.updateProgress(5, 'Connecting to local AI...');

        // Check if AI service is available
        console.log('Checking AI service availability...');
        const isAvailable = await AIPlacement.checkServiceAvailability();
        if (!isAvailable) {
            console.warn('Local AI service not detected. Skipping AI placement.');
            AIPlacement.showLoadingState(false);
            return;
        }

        console.log('Starting AI analysis flow...');
        AIPlacement.updateProgress(10, 'Initializing AI vision...');

        try {
            // 1. Capture map image
            AIPlacement.updateProgress(25, 'Capturing map coordinates...');
            const mapData = await AIPlacement.captureMapImage();
            console.log('Map data captured, type:', mapData.type);

            // 2. Send to AI for analysis
            AIPlacement.updateProgress(40, 'Analyzing property features...');
            console.log('Querying AI model:', AIPlacement.config.model);

            // Simulate gradual local inference progress since we can't get real-time stream easily
            const progressInterval = setInterval(() => {
                const bar = document.getElementById('aiProgressBar');
                const current = bar ? parseInt(bar.style.width || '40') : 40;
                if (current < 90) {
                    AIPlacement.updateProgress(current + 2, 'Local AI is thinking...');
                }
            }, 800);

            const analysis = await AIPlacement.askAI(mapData);
            clearInterval(progressInterval);
            console.log('AI response received:', analysis);

            // 3. Apply suggestions
            if (analysis && analysis.suggestions) {
                console.log('Applying', analysis.suggestions.length, 'AI suggestions');
                AIPlacement.updateProgress(95, 'Plotting vantage points...');
                AIPlacement.applySuggestions(analysis.suggestions);
                AIPlacement.updateProgress(100, 'Analysis complete!');

                // Keep progress at 100 for a moment before hiding
                setTimeout(() => {
                    AIPlacement.showLoadingState(false);
                    AIPlacement.showSuccessMessage(analysis.reasoning);
                }, 1000);
            } else {
                console.warn('AI analysis returned no suggestions or invalid JSON');
                AIPlacement.showLoadingState(false);
            }
        } catch (error) {
            console.error('AI Analysis flow error:', error);
            AIPlacement.showErrorMessage('AI Analysis Error', 'An unexpected error occurred during analysis. Check console for details.');
            AIPlacement.showLoadingState(false);
        } finally {
            AIPlacement.isAnalyzing = false;
        }
    },

    initManualTrigger: () => {
        const btn = document.getElementById('rerunAI');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Manual AI trigger clicked');
                AIPlacement.analyzeProperty();
            });
        }
    },

    checkServiceAvailability: async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const response = await fetch('http://192.168.50.67:1234/v1/models', {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response.ok;
        } catch (e) {
            return false;
        }
    },

    captureMapImage: async () => {
        return new Promise((resolve, reject) => {
            if (typeof leafletImage === 'undefined') {
                console.warn('leaflet-image library not loaded, falling back to coordinate mode.');
                const plot = LandPlotting.getLatestPlot();
                resolve({ type: 'text', data: JSON.stringify(plot) });
                return;
            }

            // Temporarily hide UI elements that shouldn't be analyzed
            const controls = document.querySelectorAll('.leaflet-control-container, .plotting-marker-label, .distance-label');
            controls.forEach(el => el.style.opacity = '0');

            leafletImage(MapManager.map, function (err, canvas) {
                // Restore UI
                controls.forEach(el => el.style.opacity = '1');

                if (err) {
                    console.error('Map capture error:', err);
                    const plot = LandPlotting.getLatestPlot();
                    resolve({ type: 'text', data: JSON.stringify(plot) });
                    return;
                }

                // Compress image to avoid token limits
                // Resize canvas to reasonable dimension for LLaVA (e.g. 512x512 max)
                const MAX_DIM = 512;
                let w = canvas.width;
                let h = canvas.height;
                if (w > MAX_DIM || h > MAX_DIM) {
                    const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
                    w *= ratio;
                    h *= ratio;
                }

                const resizedCanvas = document.createElement('canvas');
                resizedCanvas.width = w;
                resizedCanvas.height = h;
                const ctx = resizedCanvas.getContext('2d');
                ctx.drawImage(canvas, 0, 0, w, h);

                const dataUrl = resizedCanvas.toDataURL('image/jpeg', 0.8);
                // Remove prefix for API usage
                const base64Image = dataUrl.split(',')[1];

                console.log('Map captured as image for AI analysis');
                resolve({ type: 'image', data: base64Image });
            });
        });
    },

    askAI: async (plotData) => {
        try {
            // Construct prompt for LLaVA
            const promptText = `
        You are an expert drone flight planner. You are looking at a satellite map of a property.
        The property boundary is marked.
        Your goal is to suggest the optimal "Angle of Interest" shots for a real estate marketing video.
        
        Analyze the VISUAL features of the map (pool, driveway, gardens, interesting rooflines) and suggest 3 key vantage points.
        Return ONLY valid JSON in this format:
        {
          "reasoning": "Brief explanation of visual features seen",
          "suggestions": [
            { "lat": 12.34, "lng": -56.78, "description": "Pool area shot" }
          ]
        }
      `;

            const payload = {
                model: AIPlacement.config.model,
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful AI drone pilot assistant."
                    },
                    {
                        role: "user",
                        content: [
                            { type: "text", text: promptText }
                        ]
                    }
                ],
                temperature: 0.1,
                max_tokens: 500 // Correct parameter name
            };

            // Add image or text data
            if (plotData.type === 'image') {
                payload.messages[1].content.push({
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${plotData.data}`
                    }
                });
            } else {
                // Fallback to text prompt
                payload.messages[1].content[0].text += `\n\nProperty Geometry Data: ${plotData.data}`;
            }

            const response = await fetch(AIPlacement.config.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            const content = data.choices[0].message.content;

            // Parse JSON from response (handling potential markdown wrapping)
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return null;

        } catch (e) {
            console.error('Error querying AI:', e);
            return null;
        }
    },

    applySuggestions: (suggestions) => {
        if (!Array.isArray(suggestions)) return;

        const plot = LandPlotting.getLatestPlot();
        if (!plot) return;

        // Convert suggestions to POIs (Points of Interest)
        suggestions.forEach(s => {
            // Find nearest boundary point to snap to, or just add as is
            LandPlotting.addPoi(plot.id, s.lat, s.lng, 'viewpoint');
        });

        console.log(`Applied ${suggestions.length} AI suggestions`);
    },

    updateProgress: (percent, text) => {
        const bar = document.getElementById('aiProgressBar');
        const txt = document.getElementById('aiProgressText');
        if (bar) bar.style.width = percent + '%';
        if (txt) txt.textContent = text;
        const icon = document.querySelector('#aiMapOverlay .spinner');
        if (icon) icon.style.display = percent === 100 ? 'none' : 'inline-block';
    },

    showLoadingState: (isLoading) => {
        const overlay = document.getElementById('aiMapOverlay');
        const oldStatus = document.getElementById('aiStatus');

        if (isLoading) {
            if (overlay) {
                overlay.classList.remove('ai-overlay-hidden');
                overlay.querySelector('.ai-card').style.borderColor = 'var(--primary)';
            }
            if (oldStatus) oldStatus.classList.remove('hidden');
            AIPlacement.updateProgress(0, 'Waking up local AI...');
        } else {
            // Only hide if analyzeProperty finished normally
            if (!AIPlacement.isAnalyzing) {
                if (overlay) overlay.classList.add('ai-overlay-hidden');
                if (oldStatus) oldStatus.classList.add('hidden');
            }
        }
    },

    showSuccessMessage: (msg) => {
        console.log('AI Success:', msg);
        // We can show a toast here in future
    },

    showErrorMessage: (title = 'AI Connection Failed', detail = 'Make sure LM Studio is running on 192.168.50.67:1234 and CORS is enabled.') => {
        const overlay = document.getElementById('aiMapOverlay');
        const bar = document.getElementById('aiProgressBar');
        const txt = document.getElementById('aiProgressText');
        const header = document.querySelector('#aiMapOverlay strong');
        const card = document.querySelector('#aiMapOverlay .ai-card');

        if (overlay) {
            overlay.classList.remove('ai-overlay-hidden');
            if (header) header.textContent = title;
            if (txt) txt.textContent = detail;
            if (bar) {
                bar.style.width = '100%';
                bar.style.backgroundColor = 'var(--danger)';
            }
            if (card) card.style.borderColor = 'var(--danger)';

            // Auto hide error after 8 seconds
            setTimeout(() => {
                if (!AIPlacement.isAnalyzing) {
                    overlay.classList.add('ai-overlay-hidden');
                    // Reset styling
                    if (header) header.textContent = 'AI Analysis in Progress';
                    if (bar) bar.style.backgroundColor = 'var(--primary)';
                    if (card) card.style.borderColor = 'var(--primary)';
                }
            }, 8000);
        }
    }
};

// Initialize manual trigger when script loads
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(AIPlacement.initManualTrigger, 1000);
});
