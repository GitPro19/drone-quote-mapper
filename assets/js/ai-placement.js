const AIPlacement = {
    isAnalyzing: false,

    // Configuration for local AI service (LM Studio / Ollama)
    config: {
        apiUrl: 'http://localhost:1234/v1/chat/completions',
        model: 'llava-v1.5-7b', // Default to standard LLaVA model name
        temperature: 0.1,
        maxTokens: 500
    },

    // Main entry point - triggered after obstacles map is finished
    analyzeProperty: async () => {
        if (AIPlacement.isAnalyzing) return;

        // Check if AI service is available
        const isAvailable = await AIPlacement.checkServiceAvailability();
        if (!isAvailable) {
            console.log('Local AI service not detected. Skipping AI placement.');
            return;
        }

        AIPlacement.isAnalyzing = true;
        AIPlacement.showLoadingState(true);

        try {
            // 1. Capture map image
            const mapImage = await AIPlacement.captureMapImage();

            // 2. Send to AI for analysis
            const analysis = await AIPlacement.askAI(mapImage);

            // 3. Apply suggestions
            if (analysis && analysis.suggestions) {
                AIPlacement.applySuggestions(analysis.suggestions);
                AIPlacement.showSuccessMessage(analysis.reasoning);
            }
        } catch (error) {
            console.error('AI Analysis failed:', error);
            AIPlacement.showErrorMessage();
        } finally {
            AIPlacement.isAnalyzing = false;
            AIPlacement.showLoadingState(false);
        }
    },

    checkServiceAvailability: async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const response = await fetch('http://localhost:1234/v1/models', {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response.ok;
        } catch (e) {
            return false;
        }
    },

    captureMapImage: async () => {
        // Implementation depends on map library (Leaflet)
        // For now, simpler approach: we send a prompt describing the geometry
        // In future: use html2canvas or leaflet-image to get actual visual

        // For this prototype, we'll send the geometry data as JSON text
        // as passing images to LLaVA via API can be tricky without correct format
        const plot = LandPlotting.getLatestPlot();
        return JSON.stringify(plot);
    },

    askAI: async (plotData) => {
        try {
            // Construct prompt for LLaVA
            const prompt = `
        You are an expert drone flight planner. I will provide you with coordinates of a property and its buildings.
        Your goal is to suggest the optimal "Angle of Interest" shots for a real estate marketing video.
        
        Property Data: ${plotData}
        
        Analyze the geometry and suggest 3-5 key vantage points.
        Return ONLY valid JSON in this format:
        {
          "reasoning": "Brief explanation of strategy",
          "suggestions": [
            { "lat": 12.34, "lng": -56.78, "description": "Front facade shot" }
          ]
        }
      `;

            const response = await fetch(AIPlacement.config.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: AIPlacement.config.model,
                    messages: [
                        { role: "system", content: "You are a helpful AI drone pilot assistant." },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.1
                })
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

    showLoadingState: (isLoading) => {
        const statusEl = document.getElementById('aiStatus');
        if (!statusEl) return; // Need to add this element to HTML

        if (isLoading) {
            statusEl.classList.remove('hidden');
            statusEl.innerHTML = '<span class="spinner"></span> AI Analysis in Progress...';
        } else {
            statusEl.classList.add('hidden');
        }
    },

    showSuccessMessage: (msg) => {
        // Show toast or alert
        alert('AI Analysis Complete!\n\n' + msg);
    },

    showErrorMessage: () => {
        console.log('AI placement failed silently');
    }
};
