# Setting Up Automatic AI Drone Placement

This feature uses a local AI model (LLaVA) to "see" your property map and automatically suggest the best drone shot locations for each package.

## Step 1: Install Local AI Software

Since you have an AMD GPU (7900GRE), **LM Studio** is the easiest way to get started with full hardware acceleration.

1.  **Download LM Studio**: [https://lmstudio.ai/](https://lmstudio.ai/)
2.  Install and run it.
3.  In the search bar, type: `llava`
4.  Look for **`llava-v1.5-7b`** or similar (select a 4-bit quantization like `Q4_K_M` which fits easily in your VRAM).
5.  Click **Download**.

## Step 2: Start the Local Server

1.  Go to the **<-> Local Server** tab on the left sidebar.
2.  Select the **LLaVA** model you just downloaded from the top dropdown.
3.  **Vision Adapter**: Make sure "Vision Adapter" is enabled in the settings (usually auto-detected for LLaVA).
4.  **GPU Offload**: Set GPU Offload to **Maximum** to use your 7900GRE.
5.  Click **Start Server**.
    - The server will run at `http://localhost:1234`.

## Step 3: Use the App

1.  Open the Drone Quote Mapper app.
2.  Plot your property boundary.
3.  Click "Finish Mapping".
4.  The app will automatically:
    - Capture an image of your map.
    - Send it to the local AI.
    - Analyze features (house, driveway, pool, etc.).
    - Place optimized drone markers on the map!

> **Note**: The first time you run this, it might take a few seconds to load the model into memory. Subsequent runs will be instant.
